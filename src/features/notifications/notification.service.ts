import {
  getMessaging,
  type FidMulticastMessage,
  type Message,
  type MulticastMessage,
} from "firebase-admin/messaging";
import type { FcmMessage } from "./notification.schema.js";

export interface SendResult {
  successCount: number;
  failureCount: number;
  messageIds: string[];
  /** Tokens or FIDs FCM no longer recognises; safe to delete. */
  invalidTargets: string[];
  errors: { target?: string; code: string; message: string }[];
  sendAt: string;
}

const DEAD_TARGET_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/installation-id-not-registered",
]);

// The schema guarantees exactly one target field, which the casts below rely on.
export const pushService = {
  async send(message: FcmMessage, dryRun = false): Promise<SendResult> {
    const messageId = await getMessaging().send(message as Message, dryRun);
    return {
      successCount: 1,
      failureCount: 0,
      messageIds: [messageId],
      invalidTargets: [],
      errors: [],
      sendAt: new Date().toISOString(),
    };
  },

  async sendMulticast(
    message: FcmMessage,
    dryRun = false,
  ): Promise<SendResult> {
    const batch = message.fids
      ? await getMessaging().sendEachForMulticast(
          message as FidMulticastMessage,
          dryRun,
        )
      : // firebase-admin 14 deprecates registration tokens in favour of FIDs, but FCM still delivers to them.
        await getMessaging().sendEachForMulticast(
          message as MulticastMessage,
          dryRun,
        );
    const targets = message.fids ?? message.tokens ?? [];

    const result: SendResult = {
      successCount: batch.successCount,
      failureCount: batch.failureCount,
      messageIds: [],
      invalidTargets: [],
      errors: [],
      sendAt: new Date().toISOString(),
    };

    batch.responses.forEach(({ messageId, error }, i) => {
      if (messageId) {
        result.messageIds.push(messageId);
        return;
      }

      const target = targets[i];
      const code = error?.code ?? "unknown";
      result.errors.push({
        target,
        code,
        message: error?.message ?? "Send failed",
      });
      if (target && DEAD_TARGET_CODES.has(code)) {
        result.invalidTargets.push(target);
      }
    });

    return result;
  },
};
