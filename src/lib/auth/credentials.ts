import { z } from "zod";

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

export const credentialsSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(320)
    .refine((value) => /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(value), {
      message: "Enter a valid email address.",
    }),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
});

export type Credentials = z.infer<typeof credentialsSchema>;

function asRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};
}

/** A sentence the form can show before anything is sent. Empty vs invalid vs short. */
export function credentialsIssue(body: unknown): string | null {
  const parsed = credentialsSchema.safeParse(body);
  if (parsed.success) return null;

  const rec = asRecord(body);
  const field = parsed.error.issues[0]?.path[0];
  const email = typeof rec.email === "string" ? rec.email.trim() : "";
  const password = typeof rec.password === "string" ? rec.password : "";

  if (field === "email") {
    return email ? "Enter a valid email address." : "Enter your email address.";
  }

  if (field === "password") {
    if (!password) return "Enter your password.";
    return `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.`;
  }

  return "Enter your email and password.";
}

export function readCredentials(body: unknown):
  | { ok: true; value: Credentials }
  | { ok: false; message: string } {
  const parsed = credentialsSchema.safeParse(body);

  if (parsed.success) {
    return { ok: true, value: parsed.data };
  }

  return { ok: false, message: credentialsIssue(body) ?? "Enter a valid email address." };
}
