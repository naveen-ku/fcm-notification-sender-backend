import express from "express";
import { getMessaging } from "firebase-admin/messaging";

export function createApp() {
  const app = express();

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/v1/notifications", async (_req, res) => {
    try {
      const messageId = await getMessaging().send({
        topic: "all",
        data: {
          title: "Test",
          body: "This is a test notification 3",
        },
        android: {
          priority: "high",
        },
      });
      res.json({ success: true, messageId });
    } catch (error) {
      console.error("[server]: Error sending notification", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to send notification" });
    }
  });

  return app;
}
