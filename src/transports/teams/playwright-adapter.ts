// Playwright-driven Teams transport (architecture §5/§7).
// Operates ONLY on an app-owned page. Selector profiles let the same adapter drive the
// local test fixture and the REAL Teams web DOM. The "teams" profile uses the selectors
// verified live in Phase 0 (task018/evidence/phase0-findings.md):
//   chatId -> [data-track-thread-id], message -> [data-mid], sender -> [data-acc-id],
//   compose -> [contenteditable][role=textbox] (send via Enter).
import { chromium } from "playwright-core";
import type { Browser, BrowserContext, Page } from "playwright-core";
import type { TeamsMessage, TeamsTransport } from "./transport.ts";

export interface SelectorProfile {
  chatIdSelector: string;
  chatIdAttr: string;
  messageSelector: string;
  messageIdAttr: string;
  senderAttr: string;
  senderFallbackAttrs?: string[];
  composeSelector: string;
  sendMode: "button" | "enter";
  sendButtonSelector?: string;
}

export const SELECTOR_PROFILES: Record<"fixture" | "teams", SelectorProfile> = {
  fixture: {
    chatIdSelector: "#chat",
    chatIdAttr: "data-chat-id",
    messageSelector: ".msg",
    messageIdAttr: "data-message-id",
    senderAttr: "data-sender-id",
    senderFallbackAttrs: [],
    composeSelector: "#composer",
    sendMode: "button",
    sendButtonSelector: "#send",
  },
  // Verified against real teams.cloud.microsoft in Phase 0.
  teams: {
    chatIdSelector: "[data-track-thread-id]",
    chatIdAttr: "data-track-thread-id",
    messageSelector: "[data-mid]",
    messageIdAttr: "data-mid",
    senderAttr: "data-acc-id",
    // New Teams builds expose the author as data-person-mri on message rows.
    // Keep data-acc-id as the first choice for older tenants/DOM variants.
    senderFallbackAttrs: ["data-person-mri"],
    composeSelector: '[contenteditable="true"][role="textbox"]',
    sendMode: "enter",
  },
};

// Teams web rejects unrecognized browsers; present a supported desktop Edge UA.
export const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0";

export interface PlaywrightTeamsOptions {
  url: string;
  profile?: "fixture" | "teams";
  channel?: string;
  headless?: boolean;
  executablePath?: string;
  userAgent?: string;
}

export class PlaywrightTeamsAdapter implements TeamsTransport {
  private opts: PlaywrightTeamsOptions;
  private profile: SelectorProfile;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private boundChatId = "";
  // A single Electron-owned surface is shared by self-chat and groups. Reads,
  // chat selection and writes must share one queue or a background poll can
  // switch the surface while a reply is being typed.
  private ioChain: Promise<unknown> = Promise.resolve();
  private cdpMode = false;

  constructor(opts: PlaywrightTeamsOptions) {
    this.opts = opts;
    const profileName =
      opts.profile ?? (opts.url.startsWith("file:") ? "fixture" : "teams");
    this.profile = SELECTOR_PROFILES[profileName];
  }

  async open(): Promise<void> {
    this.browser = await chromium.launch({
      channel: this.opts.channel ?? "chrome",
      headless: this.opts.headless ?? true,
      ...(this.opts.executablePath ? { executablePath: this.opts.executablePath } : {}),
    });
    // Real Teams needs a supported UA; fixture doesn't care but it's harmless.
    const userAgent =
      this.opts.userAgent ?? (this.profile === SELECTOR_PROFILES.teams ? DESKTOP_UA : undefined);
    this.context = await this.browser.newContext(userAgent ? { userAgent } : {});
    this.page = await this.context.newPage();
    await this.page.goto(this.opts.url);
    await this.page.waitForSelector(this.profile.chatIdSelector);
    this.boundChatId =
      (await this.page.getAttribute(this.profile.chatIdSelector, this.profile.chatIdAttr)) ?? "";
  }

  /**
   * Production wiring (architecture §9): attach to the app-owned Teams surface that the
   * Electron host already opened (authenticated, isolated), instead of launching our own
   * browser. `cdpUrl` is the Electron host's loopback remote-debugging endpoint.
   */
  async connectCDP(cdpUrl: string): Promise<void> {
    this.cdpMode = true;
    this.browser = await chromium.connectOverCDP(cdpUrl);
    const pages: Page[] = [];
    for (const c of this.browser.contexts()) for (const pg of c.pages()) pages.push(pg);
    let chosen: Page | undefined;
    for (const pg of pages) {
      try {
        if (await pg.$(this.profile.chatIdSelector)) {
          chosen = pg;
          break;
        }
      } catch {
        /* page not ready */
      }
    }
    this.page = chosen ?? pages[0] ?? null;
    if (!this.page) throw new Error("no CDP page exposing the Teams surface");
    this.context = this.page.context();
    await this.page.waitForSelector(this.profile.chatIdSelector);
    this.boundChatId =
      (await this.page.getAttribute(this.profile.chatIdSelector, this.profile.chatIdAttr)) ?? "";
  }

  chatId(): string {
    return this.boundChatId;
  }

  /**
   * Event-driven inbox (product-brainstorm roadmap E): install a MutationObserver in the
   * page that pushes NEW messages to the host as they appear, instead of polling. Baseline
   * messages are seeded as "seen" so only genuinely new ones fire; a Set dedupes by id.
   * The observer script is a string so the project needs no DOM lib types.
   */
  async watchMessages(onMessage: (m: TeamsMessage) => void): Promise<void> {
    const page = this.requirePage();
    await page.exposeBinding(
      "__teambotPush",
      (_src, raw: { messageId: string; senderId: string; text: string }) => {
        onMessage({ chatId: this.boundChatId, ...raw });
      },
    );
    const p = this.profile;
    const script = `(() => {
      var w = window;
      if (w.__teambotObserving) return;
      w.__teambotObserving = true;
      var MID = ${JSON.stringify(p.messageIdAttr)};
      var SENDER_ATTRS = ${JSON.stringify([p.senderAttr, ...(p.senderFallbackAttrs ?? [])])};
      var MSG = ${JSON.stringify(p.messageSelector)};
      var seen = new Set();
      var validSender = function (value) {
        return !!value && !/^(announcing-region-message-list|message-list|chat-pane(?:-|$))/i.test(value);
      };
      var senderFor = function (el) {
        for (var ai = 0; ai < SENDER_ATTRS.length; ai++) {
          var nested = el.querySelector('[' + SENDER_ATTRS[ai] + ']');
          var nestedValue = nested ? nested.getAttribute(SENDER_ATTRS[ai]) : null;
          if (validSender(nestedValue)) return nestedValue;
        }
        var current = el;
        for (var depth = 0; current && depth < 8; depth++, current = current.parentElement) {
          for (var ownIndex = 0; ownIndex < SENDER_ATTRS.length; ownIndex++) {
            var own = current.getAttribute(SENDER_ATTRS[ownIndex]);
            if (validSender(own)) return own;
          }
        }
        return '';
      };
      var read = function (el) {
        var id = el.getAttribute(MID);
        if (!id || seen.has(id)) return;
        seen.add(id);
        var sender = senderFor(el);
        if (!sender) return;
        w.__teambotPush({ messageId: id, senderId: sender, text: (el.textContent || '').trim() });
      };
      document.querySelectorAll(MSG).forEach(function (el) { var id = el.getAttribute(MID); if (id) seen.add(id); });
      var obs = new MutationObserver(function (muts) {
        muts.forEach(function (m) {
          m.addedNodes.forEach(function (n) {
            if (n.nodeType !== 1) return;
            if (n.matches && n.matches(MSG)) read(n);
            if (n.querySelectorAll) n.querySelectorAll(MSG).forEach(read);
          });
        });
      });
      obs.observe(document.body, { childList: true, subtree: true });
    })()`;
    await page.evaluate(script);
  }

  async readMessages(): Promise<TeamsMessage[]> {
    return this.enqueue(() => this.readMessagesDirect());
  }

  private async readMessagesDirect(): Promise<TeamsMessage[]> {
    const page = this.requirePage();
    const chatId = this.boundChatId;
    const raw = await page.$$eval(
      this.profile.messageSelector,
      (els, p) =>
        els.map((el) => {
          const validSender = (value: string | null): value is string => Boolean(value && !/^(announcing-region-message-list|message-list|chat-pane(?:-|$))/i.test(value));
          const senderAttrs = [p.senderAttr, ...(p.senderFallbackAttrs ?? [])];
          let senderId = "";
          for (const attr of senderAttrs) {
            const nested = el.querySelector("[" + attr + "]");
            const nestedValue = nested?.getAttribute(attr) ?? null;
            if (validSender(nestedValue)) { senderId = nestedValue; break; }
          }
          let current: typeof el | null = el;
          for (let depth = 0; !senderId && current && depth < 8; depth += 1, current = current.parentElement) {
            for (const attr of senderAttrs) {
              const own = current.getAttribute(attr);
              if (validSender(own)) { senderId = own; break; }
            }
          }
          return {
            messageId: el.getAttribute(p.messageIdAttr) ?? "",
            senderId: senderId ?? "",
            text: (el.textContent ?? "").trim(),
          };
        }),
      {
        senderAttr: this.profile.senderAttr,
        senderFallbackAttrs: this.profile.senderFallbackAttrs ?? [],
        messageIdAttr: this.profile.messageIdAttr,
      },
    );
    // Teams renders system/announcement rows with data-mid but no author.
    // Keep those rows out of the command inbox; a later poll can pick up a
    // user message once its author metadata is available.
    return raw.filter((r) => r.senderId).map((r) => ({ chatId, ...r }));
  }

  /** Select a visible Teams conversation by its stable thread id. */
  async selectChat(chatId: string): Promise<void> {
    return this.enqueue(() => this.selectChatDirect(chatId));
  }

  private async selectChatDirect(chatId: string): Promise<void> {
    const page = this.requirePage();
    if (this.boundChatId === chatId) return;
    const p = this.profile;
    const found = await page.$$eval(
      p.chatIdSelector,
      (elements, args) => {
        const target = elements.find((element) => element.getAttribute(args.attr) === args.chatId) as unknown as { click(): void } | undefined;
        if (!target) return false;
        target.click();
        return true;
      },
      { attr: p.chatIdAttr, chatId },
    );
    if (!found) throw new Error(`Teams chat ${chatId} is not visible in the app-owned surface`);
    await page.waitForFunction(
      ({ selector, attr, expected }) => {
        const doc = (globalThis as unknown as { document: { querySelector(selector: string): { getAttribute(name: string): string | null } | null } }).document;
        return doc.querySelector(selector)?.getAttribute(attr) === expected;
      },
      { selector: p.chatIdSelector, attr: p.chatIdAttr, expected: chatId },
      { timeout: 10_000 },
    );
    this.boundChatId = chatId;
  }

  async readMessagesFrom(chatId: string): Promise<TeamsMessage[]> {
    return this.enqueue(async () => {
      await this.selectChatDirect(chatId);
      return this.readMessagesDirect();
    });
  }

  sendMessage(text: string): Promise<string> {
    return this.enqueue(() => this.doSend(text));
  }

  sendMessageTo(chatId: string, text: string): Promise<string> {
    return this.enqueue(async () => {
      await this.selectChatDirect(chatId);
      return this.doSend(text);
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.ioChain.then(operation);
    this.ioChain = task.catch(() => undefined);
    return task;
  }

  private async doSend(text: string): Promise<string> {
    const page = this.requirePage();
    const p = this.profile;
    const before = await page.$$eval(p.messageSelector, (els, attr) =>
      els.map((el) => el.getAttribute(attr)), p.messageIdAttr);

    if (p.sendMode === "button") {
      await page.fill(p.composeSelector, text);
      await page.click(p.sendButtonSelector as string);
    } else {
      // Real Teams: focus the contenteditable, type, and press Enter to send.
      await page.click(p.composeSelector);
      await page.keyboard.type(text);
      await page.keyboard.press("Enter");
    }

    // Reconcile: poll until a new message carrying our text appears; return its id.
    const target = before.length + 1;
    const deadline = Date.now() + 8000;
    for (;;) {
      const after = await page.$$eval(p.messageSelector, (els, attr) =>
        els.map((el) => ({ id: el.getAttribute(attr) ?? "", text: (el.textContent ?? "").trim() })), p.messageIdAttr);
      const added = after.find((m) => !before.includes(m.id) && m.text.includes(text));
      if (added) return added.id;
      if (after.length >= target && Date.now() > deadline) {
        const any = after.find((m) => !before.includes(m.id));
        if (any) return any.id;
      }
      if (Date.now() > deadline) throw new Error("send reconciliation failed: message not found");
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  private requirePage(): Page {
    if (!this.page) throw new Error("adapter not opened");
    return this.page;
  }

  async close(): Promise<void> {
    await this.ioChain.catch(() => undefined);
    if (this.cdpMode) {
      // Only disconnect from the app-owned surface; do not close the Electron app.
      if (this.browser) await this.browser.close();
    } else {
      if (this.context) await this.context.close();
      if (this.browser) await this.browser.close();
    }
    this.browser = null;
    this.context = null;
    this.page = null;
  }
}
