import type { Request, Response } from "express";
import { sendNotificationSchema } from "./notification.schema.js";
import { pushService } from "./notification.service.js";
import {
  ValidationError,
  type ValidationErrorItem,
} from "../../shared/http-error.js";

export const sendNotificationHandler = async (req: Request, res: Response) => {
  const parsed = sendNotificationSchema.safeParse(req.body);

  if (!parsed.success) {
    const details: ValidationErrorItem[] = parsed.error.issues.map((issue) => ({
      path: issue.path.join(".") || "root",
      message: issue.message,
    }));
    throw new ValidationError(details);
  }

  const { dryRun, ...message } = parsed.data;
  const result =
    message.tokens || message.fids
      ? await pushService.sendMulticast(message, dryRun)
      : await pushService.send(message, dryRun);

  // A multicast reports per-target failures instead of throwing; if none got through, FCM rejected the send.
  res.status(result.successCount > 0 ? 200 : 502).json(result);
};
