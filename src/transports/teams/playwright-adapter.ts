// Playwright-driven Teams transport (architecture §5/§7).
// Operates ONLY on an app-owned page (here, a local fixture; in production the
// app's isolated Teams WebContentsView). Reads stable chat/message/sender ids from
// the DOM and serializes sends so a single writer owns the conversation.
import { chromium } from "playwright-core";
import type { Browser, Page } from "playwright-core";
import type { TeamsMessage, TeamsTransport } from "./transport.ts";

export interface PlaywrightTeamsOptions {
  url: string;
  /** Installed browser channel (e.g. "chrome", "msedge"). */
  channel?: string;
  headless?: boolean;
  executablePath?: string;
}

export class PlaywrightTeamsAdapter implements TeamsTransport {
  private opts: PlaywrightTeamsOptions;
  private browser: Browser | null = null;
  private page: Page | null = null;
  private boundChatId = "";
  // Single-writer send queue: chain all sends so replies are strictly ordered.
  private writeChain: Promise<unknown> = Promise.resolve();

  constructor(opts: PlaywrightTeamsOptions) {
    this.opts = opts;
  }

  async open(): Promise<void> {
    this.browser = await chromium.launch({
      channel: this.opts.channel ?? "chrome",
      headless: this.opts.headless ?? true,
      ...(this.opts.executablePath ? { executablePath: this.opts.executablePath } : {}),
    });
    this.page = await this.browser.newPage();
    await this.page.goto(this.opts.url);
    await this.page.waitForSelector("#chat");
    this.boundChatId =
      (await this.page.getAttribute("#chat", "data-chat-id")) ?? "";
  }

  chatId(): string {
    return this.boundChatId;
  }

  async readMessages(): Promise<TeamsMessage[]> {
    const page = this.requirePage();
    const chatId = this.boundChatId;
    const raw = await page.$$eval(".msg", (els) =>
      els.map((el) => ({
        messageId: el.getAttribute("data-message-id") ?? "",
        senderId: el.getAttribute("data-sender-id") ?? "",
        text: el.textContent ?? "",
      })),
    );
    return raw.map((r) => ({ chatId, ...r }));
  }

  sendMessage(text: string): Promise<string> {
    // Chain onto the write queue: one writer, strict order, correct conversation.
    const task = this.writeChain.then(() => this.doSend(text));
    // Keep the chain alive even if a send rejects.
    this.writeChain = task.catch(() => undefined);
    return task;
  }

  private async doSend(text: string): Promise<string> {
    const page = this.requirePage();
    const before = await page.$$eval(".msg", (els) =>
      els.map((el) => el.getAttribute("data-message-id")),
    );
    await page.fill("#composer", text);
    await page.click("#send");
    // Poll (Node-side, via typed $$eval) until a new message appears — avoids
    // referencing browser globals so the project needs no DOM lib.
    const target = before.length + 1;
    const deadline = Date.now() + 5000;
    let after: Array<{ id: string; text: string }> = [];
    for (;;) {
      after = await page.$$eval(".msg", (els) =>
        els.map((el) => ({
          id: el.getAttribute("data-message-id") ?? "",
          text: el.textContent ?? "",
        })),
      );
      if (after.length >= target) break;
      if (Date.now() > deadline) {
        throw new Error("timeout waiting for sent message to appear");
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    const added = after.find((m) => !before.includes(m.id));
    if (!added || added.text !== text) {
      throw new Error("send reconciliation failed: sent message not found in DOM");
    }
    return added.id;
  }

  private requirePage(): Page {
    if (!this.page) throw new Error("adapter not opened");
    return this.page;
  }

  async close(): Promise<void> {
    await this.writeChain.catch(() => undefined);
    if (this.browser) await this.browser.close();
    this.browser = null;
    this.page = null;
  }
}
