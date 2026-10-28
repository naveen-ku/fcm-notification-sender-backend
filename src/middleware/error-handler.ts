import type { Request, Response, NextFunction } from "express";
import { FirebaseMessagingError } from "firebase-admin/messaging";
import { AppError } from "../shared/http-error.js";

// FCM rejections are expected outcomes, not crashes. Anything not listed is a
// problem between us and FCM (credentials, outage), so it defaults to 502.
const FCM_ERROR_STATUS: Record<string, number> = {
  "messaging/invalid-argument": 400,
  "messaging/invalid-payload": 400,
  "messaging/invalid-recipient": 400,
  "messaging/invalid-data-payload-key": 400,
  "messaging/payload-size-limit-exceeded": 400,
  "messaging/invalid-registration-token": 400,
  "messaging/invalid-package-name": 400,
  "messaging/registration-token-not-registered": 404,
  "messaging/installation-id-not-registered": 404,
  "messaging/message-rate-exceeded": 429,
  "messaging/device-message-rate-exceeded": 429,
  "messaging/topics-message-rate-exceeded": 429,
  "messaging/server-unavailable": 503,
};

export const errorHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  if (error instanceof AppError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    });
    return;
  }

  if (error instanceof FirebaseMessagingError) {
    res.status(FCM_ERROR_STATUS[error.code] ?? 502).json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
    return;
  }

  console.error("[server]: Unhandled error", error);
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    },
  });
};
