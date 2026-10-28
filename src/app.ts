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
  return app;
}
