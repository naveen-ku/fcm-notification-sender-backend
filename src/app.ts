import express from "express";
import { getMessaging } from "firebase-admin/messaging";
import { env } from "./config/env.js";
import cors from "cors";
import { apiRouter } from "./routes.js";
import { NotFoundError } from "./shared/http-error.js";
import { errorHandler } from "./middleware/error-handler.js";

export function createApp() {
  const app = express();

  app.use(express.json({ limit: "1mb" }));
  app.use(cors({ origin: env.corsOrigin }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "fcm-push-sender-backend" });
  });

  app.use("/api", apiRouter);
  app.use((_req, _res, next) => next(new NotFoundError("Route not found")));
  app.use(errorHandler);

  //   app.post("/api/v1/notifications", async (_req, res) => {
  //     try {
  //       const messageId = await getMessaging().send({
  //         topic: "all",
  //         data: {
  //           title: "Test",
  //           body: "This is a test notification 3",
  //         },
  //         android: {
  //           priority: "high",
  //         },
  //       });
  //       res.json({ success: true, messageId });
  //     } catch (error) {
  //       console.error("[server]: Error sending notification", error);
  //       res
  //         .status(500)
  //         .json({ success: false, error: "Failed to send notification" });
  //     }
  //   });

  return app;
}
