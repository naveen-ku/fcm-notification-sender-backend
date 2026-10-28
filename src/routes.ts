import { Router } from "express";
import { notificationRouter } from "./features/notifications/notification.routes.js";

export const apiRouter = Router();

apiRouter.use("/v1/notifications", notificationRouter);
