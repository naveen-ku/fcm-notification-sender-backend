import { z } from "zod";

export const targetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("token"), value: z.string().min(1) }),
  z.object({
    type: z.literal("tokens"),
    value: z.array(z.string().min(1)).min(1),
  }),
  z.object({
    type: z.literal("topic"),
    value: z.string().regex(/^[a-zA-Z0-9-_.~%]+$/),
  }),
  z.object({ type: z.literal("condition"), value: z.string().min(1) }),
]);

export const constantSchema = z
  .object({
    title: z.string().max(60).optional(),
    body: z.string().max(200).optional(),
    image: z.string().url().optional(),
  })
  .refine(
    (c) => {
      return c.title || c.body || c.image;
    },
    {
      message: "At least one of title, body, or image is required",
    },
  );

export const optionsSchema = z
  .object({
    priority: z.enum(["normal", "high"]).optional(),
    ttlSeconds: z.number().int().min(0).max(2_419_200).optional(),
    clickAction: z.string().optional(), // On click open the route
  })
  .optional();

export const sendNotificationSchema = z
  .object({
    target: targetSchema,
    notification: constantSchema.optional(),
    data: z.record(z.string(), z.string()).optional(),
    options: optionsSchema.optional(),
  })
  .refine((r) => r.notification || r.data, {
    message: "At least one of notification or data is required",
  });

export type SendNotificationRequest = z.infer<typeof sendNotificationSchema>;
export type NotificationTarget = z.infer<typeof targetSchema>;
