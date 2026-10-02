// Teams transport abstraction (architecture §5/§7).
// The rest of TeamBot depends only on this interface, so the real Playwright-driven
// Teams surface and a test fixture/fake are interchangeable. Every read/write is
// tied to a specific chatId; a single adapter serializes writes (one writer) so
// switching conversations never misroutes a reply.

export interface TeamsMessage {
  chatId: string;
  messageId: string;
  senderId: string;
  text: string;
}

export interface TeamsTransport {
  /** The conversation this transport is bound to. */
  chatId(): string;
  /** Current visible messages for the bound conversation. */
  readMessages(): Promise<TeamsMessage[]>;
  /** Send a message to the bound conversation; resolves with its messageId. */
  sendMessage(text: string): Promise<string>;
  /** Optional cross-chat writer used by a coordinator shared by group/self pairings. */
  sendMessageTo?(chatId: string, text: string): Promise<string>;
  close(): Promise<void>;
}

/** Routes writes to the app-owned adapter for the requested conversation. */
export class RoutedTeamsTransport implements TeamsTransport {
  private readonly defaultChat: string;
  private readonly routes: ReadonlyMap<string, TeamsTransport>;
  constructor(routes: ReadonlyMap<string, TeamsTransport>, defaultChatId?: string) {
    this.routes = routes;
    const first = routes.keys().next().value as string | undefined;
    this.defaultChat = defaultChatId ?? first ?? "";
    if (!this.defaultChat || !routes.has(this.defaultChat)) throw new Error("a default Teams chat route is required");
  }

  chatId(): string { return this.defaultChat; }
  readMessages(): Promise<TeamsMessage[]> { return this.route(this.defaultChat).readMessages(); }
  sendMessage(text: string): Promise<string> { return this.route(this.defaultChat).sendMessage(text); }
  sendMessageTo(chatId: string, text: string): Promise<string> {
    return this.route(chatId).sendMessage(text);
  }
  async close(): Promise<void> {
    await Promise.all([...new Set(this.routes.values())].map((transport) => transport.close()));
  }

  private route(chatId: string): TeamsTransport {
    const route = this.routes.get(chatId);
    if (!route) throw new Error(`no Teams route for chat ${chatId}`);
    return route;
  }
}
