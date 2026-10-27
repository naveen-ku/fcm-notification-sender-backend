import z from "zod";

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  CORS_ORIGIN: z
    .string()
    .default("http://localhost:3000")
    .transform((v) =>
      v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.url())),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "Invalid environment variables:",
    z.prettifyError(parsed.error),
  );
  process.exit(1);
}

export const env = {
  port: parsed.data.PORT,
  corsOrigin: parsed.data.CORS_ORIGIN,
};
