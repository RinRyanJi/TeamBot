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
  private writeChain: Promise<unknown> = Promise.resolve();
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

  async readMessages(): Promise<TeamsMessage[]> {
    const page = this.requirePage();
    const chatId = this.boundChatId;
    const raw = await page.$$eval(
      this.profile.messageSelector,
      (els, p) =>
        els.map((el) => {
          let senderId = el.getAttribute(p.senderAttr);
          if (!senderId) {
            const inner = el.querySelector("[" + p.senderAttr + "]");
            const outer = el.closest("[" + p.senderAttr + "]");
            senderId = (inner && inner.getAttribute(p.senderAttr)) || (outer && outer.getAttribute(p.senderAttr)) || "";
          }
          return {
            messageId: el.getAttribute(p.messageIdAttr) ?? "",
            senderId: senderId ?? "",
            text: (el.textContent ?? "").trim(),
          };
        }),
      { senderAttr: this.profile.senderAttr, messageIdAttr: this.profile.messageIdAttr },
    );
    return raw.map((r) => ({ chatId, ...r }));
  }

  sendMessage(text: string): Promise<string> {
    const task = this.writeChain.then(() => this.doSend(text));
    this.writeChain = task.catch(() => undefined);
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
    await this.writeChain.catch(() => undefined);
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
