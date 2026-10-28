import type { NextFunction, Request, Response } from "express";
import { sendNotificationSchema } from "./notification.schema.js";
import { sendNotification } from "./notification.service.js";

export const sendNotificationHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const parsed = sendNotificationSchema.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Invalid request", issues: parsed.error.issues });
  }

  try {
    const result = await sendNotification(parsed.data);
    const status = result.successCount > 0 ? 200 : 502;
  } catch (error) {
    return next(error);
  }
};
