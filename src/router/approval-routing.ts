// Where to surface an approval request (architecture §5).
// Dangerous operations must not expose their approval code + scope to a whole group;
// they are routed to the initiator's self-chat/DM. Low-risk approvals stay in place.
import type { Pairing } from "../storage/store.ts";

const DANGEROUS = /\b(write|delete|remove|rm|network|exfiltrat|outside|escalat|sudo)\b/i;

export function isDangerousScope(scope: string | null | undefined): boolean {
  if (!scope) return false;
  return DANGEROUS.test(scope);
}

export interface ApprovalTarget {
  chatId: string;
  isolated: boolean; // true when redirected away from the group to the self-chat
}

/**
 * Decide which conversation an approval request should be shown in.
 * - Group + dangerous scope -> the initiator's self-chat (isolated).
 * - Otherwise -> the source conversation.
 */
export function approvalTarget(
  scope: string | null | undefined,
  pairing: Pairing,
  selfChatId: string | undefined,
): ApprovalTarget {
  if (pairing.kind === "group" && isDangerousScope(scope) && selfChatId) {
    return { chatId: selfChatId, isolated: true };
  }
  return { chatId: pairing.chatId, isolated: false };
}
