import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FirebaseMessagingError } from "firebase-admin/messaging";
import { createApp } from "../app.js";

const messaging = vi.hoisted(() => ({
  send: vi.fn(),
  sendEachForMulticast: vi.fn(),
}));

vi.mock("firebase-admin/messaging", async (importOriginal) => ({
  ...(await importOriginal<typeof import("firebase-admin/messaging")>()),
  getMessaging: () => messaging,
}));

const post = (body: object) =>
  request(createApp()).post("/api/v1/notifications/send").send(body);

const fcmError = (code: string) =>
  new FirebaseMessagingError({ code, message: `FCM said ${code}` });

const errorMessages = (response: request.Response): string[] =>
  response.body.error.details.map(
    (d: { path: string; message: string }) => `${d.path}: ${d.message}`,
  );

beforeEach(() => {
  messaging.send.mockReset().mockResolvedValue("projects/p/messages/1");
  messaging.sendEachForMulticast.mockReset();
});

describe("POST /api/v1/notifications/send", () => {
  it.each([
    { token: "device-token" },
    { topic: "all" },
    {
      condition: "'news' in topics && ('sports' in topics || 'tech' in topics)",
    },
    { fid: "installation-id" },
  ])("passes a single-target message to FCM unchanged: %o", async (target) => {
    const message = {
      ...target,
      notification: {
        title: "Budget alert",
        body: "You spent 90%",
        imageUrl: "https://cdn.example.com/a.png",
      },
      data: { route: "/budgets/42" },
      android: {
        priority: "high",
        ttl: 3_600_000,
        collapseKey: "budget",
        notification: {
          channelId: "alerts",
          clickAction: "OPEN_BUDGETS",
          color: "#ff0000",
        },
      },
    };

    const response = await post(message);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      successCount: 1,
      failureCount: 0,
      messageIds: ["projects/p/messages/1"],
      invalidTargets: [],
    });
    expect(messaging.send).toHaveBeenCalledWith(message, false);
  });

  it("passes dryRun to FCM separately and allows a target-only message", async () => {
    const response = await post({ token: "t", dryRun: true });

    expect(response.status).toBe(200);
    expect(messaging.send).toHaveBeenCalledWith({ token: "t" }, true);
  });

  it("turns android.notification.eventTimestamp into a Date for the SDK", async () => {
    await post({
      token: "t",
      android: { notification: { eventTimestamp: "2026-01-01T10:00:00Z" } },
    });

    expect(
      messaging.send.mock.calls[0]![0].android.notification.eventTimestamp,
    ).toEqual(new Date("2026-01-01T10:00:00Z"));
  });

  it("multicasts a token list and reports dead tokens", async () => {
    messaging.sendEachForMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 1,
      responses: [
        { success: true, messageId: "m1" },
        {
          success: false,
          error: fcmError("registration-token-not-registered"),
        },
      ],
    });

    const response = await post({
      tokens: ["a", "b", "a"],
      notification: { body: "Hello" },
    });

    expect(messaging.sendEachForMulticast).toHaveBeenCalledWith(
      { tokens: ["a", "b"], notification: { body: "Hello" } },
      false,
    );
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      successCount: 1,
      failureCount: 1,
      messageIds: ["m1"],
      invalidTargets: ["b"],
      errors: [
        { target: "b", code: "messaging/registration-token-not-registered" },
      ],
    });
  });

  it("multicasts to fids and returns 502 when none got through", async () => {
    messaging.sendEachForMulticast.mockResolvedValue({
      successCount: 0,
      failureCount: 1,
      responses: [
        { success: false, error: fcmError("installation-id-not-registered") },
      ],
    });

    const response = await post({ fids: ["fid-1"], data: { kind: "sync" } });

    expect(messaging.sendEachForMulticast).toHaveBeenCalledWith(
      { fids: ["fid-1"], data: { kind: "sync" } },
      false,
    );
    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({
      failureCount: 1,
      invalidTargets: ["fid-1"],
      errors: [{ target: "fid-1" }],
    });
  });

  it.each([
    ["registration-token-not-registered", 404],
    ["invalid-argument", 400],
    ["message-rate-exceeded", 429],
    ["third-party-auth-error", 502],
  ])("maps FCM error %s on a single send to HTTP %i", async (code, status) => {
    messaging.send.mockRejectedValue(fcmError(code));

    const response = await post({ token: "t", notification: { title: "Hi" } });

    expect(response.status).toBe(status);
    expect(response.body.error).toEqual({
      code: `messaging/${code}`,
      message: `FCM said ${code}`,
    });
  });

  it("still answers 500 for errors that are not from FCM", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    messaging.send.mockRejectedValue(new Error("boom"));

    const response = await post({ token: "t", notification: { title: "Hi" } });

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("INTERNAL_ERROR");
  });

  it.each([
    ["no target", { notification: { title: "Hi" } }, "target: Exactly one of"],
    [
      "two targets",
      { token: "t", fid: "f", data: { a: "1" } },
      "target: Exactly one of",
    ],
    ["no payload", { token: "t", data: {} }, "payload: Message must contain"],
    [
      "an iOS block",
      { token: "t", data: { a: "1" }, apns: {} },
      'Unrecognized key: "apns"',
    ],
    [
      "a web push block",
      { token: "t", data: { a: "1" }, webpush: {} },
      'Unrecognized key: "webpush"',
    ],
    [
      "a REST-style field name",
      { token: "t", android: { notification: { click_action: "X" } } },
      'android.notification: Unrecognized key: "click_action"',
    ],
    [
      "a REST-style ttl",
      { token: "t", data: { a: "1" }, android: { ttl: "3600s" } },
      "android.ttl",
    ],
    [
      "a ttl over 28 days",
      { token: "t", data: { a: "1" }, android: { ttl: 2_419_200_001 } },
      "android.ttl",
    ],
    [
      "a non-https image",
      { token: "t", notification: { imageUrl: "http://x.com/a.png" } },
      "notification.imageUrl",
    ],
    [
      "more than 500 tokens",
      {
        tokens: Array.from({ length: 501 }, (_, i) => `t${i}`),
        data: { a: "1" },
      },
      "tokens:",
    ],
    [
      "a condition with 6 topics",
      {
        condition: Array(6).fill("'a' in topics").join(" || "),
        data: { a: "1" },
      },
      "condition: Condition must reference",
    ],
    [
      "an invalid topic name",
      { topic: "news/today", data: { a: "1" } },
      "topic: Topic may contain",
    ],
    [
      "a reserved data key",
      { topic: "all", data: { "google.x": "1" } },
      "data.google.x: Data keys cannot",
    ],
    [
      "a bad notification color",
      { token: "t", android: { notification: { color: "red" } } },
      "android.notification.color",
    ],
    [
      "titleLocArgs without titleLocKey",
      { token: "t", android: { notification: { titleLocArgs: ["x"] } } },
      "android.notification.titleLocKey",
    ],
  ])("rejects %s", async (_name, body, expected) => {
    const response = await post(body);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(errorMessages(response).some((m) => m.includes(expected))).toBe(
      true,
    );
    expect(messaging.send).not.toHaveBeenCalled();
    expect(messaging.sendEachForMulticast).not.toHaveBeenCalled();
  });
});
