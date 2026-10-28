import { z } from "zod";

/**
 * Zod representation of the Android message firebase-admin's `getMessaging()`
 * accepts: `Message` for one target, `FidMulticastMessage` / `MulticastMessage`
 * for many.
 * https://firebase.google.com/docs/reference/admin/node/firebase-admin.messaging
 *
 * Field names and units follow firebase-admin, not the FCM v1 REST docs. The SDK
 * converts them to REST itself (e.g. `ttl: 3600000` becomes `"3600s"`,
 * `clickAction` becomes `click_action`) and rejects REST-style values.
 *
 * Android only: `apns`, `webpush` and unknown keys are rejected.
 * All request types are inferred from these schemas (single source of truth).
 */

// ---------- primitives ----------

/** Data keys FCM reserves for itself. */
const RESERVED_DATA_KEY = /^(from|message_type)$|^(google|gcm)/;

/** String-to-string map used by `data` and `android.data`. */
export const dataSchema = z
  .record(z.string().min(1), z.string())
  .superRefine((data, ctx) => {
    Object.keys(data)
      .filter((key) => RESERVED_DATA_KEY.test(key))
      .forEach((key) =>
        ctx.addIssue({
          code: "custom",
          path: [key],
          message:
            'Data keys cannot be "from", "message_type", or start with "google" or "gcm"',
        }),
      );
  });

/** Duration in milliseconds; firebase-admin sends it to FCM as `"<n>s"`. */
const millisSchema = z.number().int().nonnegative();

/** `#RRGGBB`. */
const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #RRGGBB");

/** `#RRGGBB` or `#RRGGBBAA`. */
const hexColorWithAlphaSchema = z
  .string()
  .regex(
    /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/,
    "Must be a hex color like #RRGGBB or #RRGGBBAA",
  );

/** https only: Android blocks cleartext image downloads by default. */
const imageUrlSchema = z.url({
  protocol: /^https$/,
  error: "Must be an https URL",
});

/** FCM topic name rules (without the `/topics/` prefix). */
const topicSchema = z
  .string()
  .regex(/^[a-zA-Z0-9-_.~%]+$/, "Topic may contain A-Z a-z 0-9 and -_.~%");

/** Topic expression such as `'news' in topics && 'sports' in topics`; FCM allows 1 to 5 topics. */
const conditionSchema = z
  .string()
  .trim()
  .refine((condition) => {
    const topics = condition.match(/\bin\s+topics\b/g)?.length ?? 0;
    return topics >= 1 && topics <= 5;
  }, "Condition must reference 1 to 5 topics, e.g. 'news' in topics && 'sports' in topics");

/** Registration tokens or FIDs for one multicast; FCM caps it at 500. Duplicates are dropped. */
const multicastTargetsSchema = z
  .array(z.string().min(1))
  .min(1)
  .max(500)
  .transform((ids) => [...new Set(ids)]);

/** Label for FCM delivery analytics. */
const analyticsLabelSchema = z
  .string()
  .regex(
    /^[a-zA-Z0-9-_.~%]{1,50}$/,
    "Must be 1-50 characters of A-Z a-z 0-9 and -_.~%",
  );

// ---------- Notification ----------

export const notificationSchema = z.strictObject({
  title: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
  imageUrl: imageUrlSchema.optional(),
});

// ---------- AndroidConfig ----------

const androidNotificationPrioritySchema = z.enum([
  "min",
  "low",
  "default",
  "high",
  "max",
]);

const androidVisibilitySchema = z.enum(["private", "public", "secret"]);

export const lightSettingsSchema = z.strictObject({
  color: hexColorWithAlphaSchema,
  lightOnDurationMillis: millisSchema,
  lightOffDurationMillis: millisSchema,
});

export const androidNotificationSchema = z
  .strictObject({
    title: z.string().min(1).optional(),
    body: z.string().min(1).optional(),
    icon: z.string().min(1).optional(),
    color: hexColorSchema.optional(),
    sound: z.string().min(1).optional(),
    tag: z.string().min(1).optional(),
    imageUrl: imageUrlSchema.optional(),
    clickAction: z.string().min(1).optional(),
    bodyLocKey: z.string().min(1).optional(),
    bodyLocArgs: z.array(z.string()).optional(),
    titleLocKey: z.string().min(1).optional(),
    titleLocArgs: z.array(z.string()).optional(),
    channelId: z.string().min(1).optional(),
    ticker: z.string().min(1).optional(),
    sticky: z.boolean().optional(),
    /** ISO 8601 date-time; firebase-admin wants a `Date`, which JSON can't carry. */
    eventTimestamp: z.iso
      .datetime({ offset: true })
      .transform((value) => new Date(value))
      .optional(),
    localOnly: z.boolean().optional(),
    /** How prominently the notification is shown (delivery priority is `android.priority`). */
    priority: androidNotificationPrioritySchema.optional(),
    vibrateTimingsMillis: z.array(millisSchema).min(1).optional(),
    defaultVibrateTimings: z.boolean().optional(),
    defaultSound: z.boolean().optional(),
    lightSettings: lightSettingsSchema.optional(),
    defaultLightSettings: z.boolean().optional(),
    visibility: androidVisibilitySchema.optional(),
    notificationCount: z.number().int().nonnegative().optional(),
    proxy: z.enum(["allow", "deny", "if_priority_lowered"]).optional(),
  })
  .refine((n) => !n.bodyLocArgs || n.bodyLocKey, {
    message: "bodyLocKey is required when bodyLocArgs is set",
    path: ["bodyLocKey"],
  })
  .refine((n) => !n.titleLocArgs || n.titleLocKey, {
    message: "titleLocKey is required when titleLocArgs is set",
    path: ["titleLocKey"],
  });

export const androidFcmOptionsSchema = z.strictObject({
  analyticsLabel: analyticsLabelSchema.optional(),
});

export const androidConfigSchema = z.strictObject({
  collapseKey: z.string().min(1).optional(),
  /** Delivery priority. */
  priority: z.enum(["normal", "high"]).optional(),
  /** Milliseconds, up to 28 days. */
  ttl: millisSchema.max(2_419_200_000).optional(),
  restrictedPackageName: z.string().min(1).optional(),
  data: dataSchema.optional(),
  notification: androidNotificationSchema.optional(),
  fcmOptions: androidFcmOptionsSchema.optional(),
  directBootOk: z.boolean().optional(),
});

// ---------- Message (root) ----------

const targetFieldNames = [
  "token",
  "topic",
  "condition",
  "fid",
  "tokens",
  "fids",
] as const;

const sendNotificationBaseSchema = z.strictObject({
  token: z.string().min(1).optional(),
  topic: topicSchema.optional(),
  condition: conditionSchema.optional(),
  fid: z.string().min(1).optional(),
  tokens: multicastTargetsSchema.optional(),
  fids: multicastTargetsSchema.optional(),
  notification: notificationSchema.optional(),
  data: dataSchema.optional(),
  android: androidConfigSchema.optional(),
  /** Have FCM validate the message without delivering it. */
  dryRun: z.boolean().optional(),
});

function hasPayload(msg: z.infer<typeof sendNotificationBaseSchema>): boolean {
  return (
    msg.notification !== undefined ||
    msg.android?.notification !== undefined ||
    Object.keys({ ...msg.data, ...msg.android?.data }).length > 0
  );
}

export const sendNotificationSchema = sendNotificationBaseSchema
  .refine(
    (msg) =>
      targetFieldNames.filter((field) => msg[field] !== undefined).length === 1,
    {
      message: `Exactly one of ${targetFieldNames.join(", ")} is required`,
      path: ["target"],
    },
  )
  .refine((msg) => msg.dryRun === true || hasPayload(msg), {
    message:
      "Message must contain at least one of notification, data, android.notification or android.data (or set dryRun)",
    path: ["payload"],
  });

// ---------- Inferred types ----------

export type AndroidNotification = z.infer<typeof androidNotificationSchema>;
export type AndroidConfig = z.infer<typeof androidConfigSchema>;
export type SendNotificationRequest = z.infer<typeof sendNotificationSchema>;
/** What reaches getMessaging(): the request minus `dryRun`, which is passed separately. */
export type FcmMessage = Omit<SendNotificationRequest, "dryRun">;
