import { getMessaging } from "firebase-admin/messaging";
import type { SendNotificationRequest } from "./notification.schema.js";

export interface SendResult {
  successCount: number;
  failureCount: number;
  messageIds: string[];
  invalidTokens: string[];
  errors: { token?: string; code: string; message: string }[];
}

const DEAD_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

export const sendNotification = async (
  req: SendNotificationRequest,
): Promise<SendResult> => {
  const base = buildBaseMessage(req);
  const firebaseMessaging = getMessaging();

  const { target } = req;

  let message;

  switch (target.type) {
    case "token":
      message = { ...base, token: target.value };
      break;

    case "topic":
      message = { ...base, topic: target.value };
      break;

    case "condition":
      message = { ...base, condition: target.value };
      break;

    default:
      throw new Error(`Unsupported target type: ${target.type}`);
  }

  try {
    const id = await firebaseMessaging.send(message);
    return {
      successCount: 1,
      failureCount: 0,
      messageIds: [id],
      invalidTokens: [],
      errors: [],
    };
  } catch (error) {
    const e = error as { code?: string; message?: string };
    const code = e.code ?? "unknown";
    return {
      successCount: 0,
      failureCount: 1,
      messageIds: [],
      invalidTokens:
        target.type === "token" && DEAD_TOKEN_CODES.has(code)
          ? [target.value]
          : [],
      errors: [{ code, message: e.message ?? "Send failed" }],
    };
  }
};
