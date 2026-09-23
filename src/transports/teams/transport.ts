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
  close(): Promise<void>;
}
