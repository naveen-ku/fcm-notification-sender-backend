import { Router } from "express";
import { sendNotificationHandler } from "./notification.controller.js";

export const notificationRouter = Router();

notificationRouter.post("/send", sendNotificationHandler);
