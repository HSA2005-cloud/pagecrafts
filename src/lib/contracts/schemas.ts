import { z } from "zod";

import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/auth/credentials";
import { MAX_CLASSIFY_CHARS } from "./ai";

// Runtime request validators for the persistence routes. Kept aligned with the
// TypeScript contracts in this folder; Zod guards the HTTP boundary (M0.2).

export const createProjectSchema = z.object({
  name: z.string().min(1).max(80),
  sourceTemplateId: z.string().uuid().optional(),
  mode: z.literal("generate").optional(),
  // The same constant composeBrief truncates to and the generate route accepts. It was a
  // hardcoded 500 while MAX_CLASSIFY_CHARS moved to 2000 for the custom path, so a brief
  // that composed past 500 was built, sent, accepted by /generate -- and refused here, at
  // the first step, with nothing on screen naming the field.
  prompt: z.string().max(MAX_CLASSIFY_CHARS).optional(),
  brief: z
    .object({
      name: z.string().trim().min(1).max(80),
      offer: z.string().trim().min(1).max(500),
      place: z.string().trim().min(1).max(80),
      phone: z.string().trim().max(20).optional(),
      hours: z.string().trim().max(80).optional(),
      extra: z.string().trim().max(200).optional(),
    })
    .optional(),
});

export const patchProjectSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  siteMeta: z
    .object({
      title: z.string().max(200).optional(),
      description: z.string().max(500).optional(),
      faviconAssetId: z.string().optional(),
      faviconUrl: z.string().url().optional(),
      ogImageAssetId: z.string().optional(),
      ogImageUrl: z.string().url().optional(),
      upiId: z
        .string()
        .trim()
        .max(80)
        .refine(
          (value) =>
            value === "" ||
            /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/.test(value),
          "That does not look like a UPI ID.",
        )
        .optional(),
    })
    .optional(),
  formEndpoint: z
    .string()
    .url()
    .startsWith("https://", "The form address must start with https://")
    .nullable()
    .optional(),
});

export const putFilesSchema = z.object({
  files: z.record(z.string(), z.string()),
  // The `updatedAt` the caller last read, echoed back so the write can be refused if the
  // project has moved on since (R3 D6). Optional: a caller that means "replace whatever is
  // there" — fork, a script — omits it and keeps the old last-writer-wins behaviour.
  expectedUpdatedAt: z.string().datetime().optional(),
});

// PUT /projects/{id}/files/{path} — a single file write. The path itself arrives in the
// URL and is validated separately (isValidFilePath -> 422).
export const putFileSchema = z.object({
  content: z.string(),
});

// PATCH /projects/{id}/content — ops against content_json. Semantic validation (does the
// slot exist, does the value fit its FieldType) happens against the template's
// content_schema after parse; this only guards the transport shape.
export const patchContentSchema = z.object({
  ops: z
    .array(
      z.object({
        path: z.string().min(1).max(200),
        value: z.unknown(),
      }),
    )
    .min(1)
    .max(50),
});

// POST /projects/{id}/assets — the JSON (Unsplash) body. Uploads arrive as multipart
// form-data and never hit this schema.
export const createUnsplashAssetSchema = z.object({
  source: z.literal("unsplash"),
  unsplashId: z.string().min(1).max(80),
  kind: z.enum(["image", "favicon", "og_image"]).optional(),
});

export const createCommitSchema = z.object({
  message: z.string().min(1).max(500),
});

// POST /projects/{id}/restore — the sha shape is the commits.sha column's own check, so a
// value that could never exist is refused at the edge rather than as a miss in the table.
export const restoreSchema = z.object({
  sha: z
    .string()
    .regex(/^[0-9a-f]{7,40}$/, "That is not a version id."),
});

// PATCH /account/consent — required, not optional. An absent value would have to be given a
// meaning, and every meaning available (leave it, clear it, assume yes) is a way to get
// consent wrong.
export const consentSchema = z.object({
  trainingOptIn: z.boolean(),
});

export const billingProfileSchema = z.object({
  displayName: z.string().trim().max(80),
  phone: z.string().trim().max(20),
  billingLine: z.string().trim().max(120),
  billingCity: z.string().trim().max(80),
  billingState: z.string().trim().max(80),
  billingPostal: z.string().trim().max(20),
  billingCountry: z.string().trim().max(80),
  gstin: z.string().trim().max(15),
});

export const notifyPrefsSchema = z.object({
  email: z.boolean(),
  published: z.boolean(),
  updated: z.boolean(),
  payments: z.boolean(),
  security: z.boolean(),
});

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1).max(MAX_PASSWORD_LENGTH),
    password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
    confirmPassword: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Both passwords need to match.",
  });

export const notifyPrefsRequestSchema = z.object({
  notifyPrefs: notifyPrefsSchema,
});

export const paymentVerifySchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

const discountCodeField = z
  .string()
  .trim()
  .max(32)
  .optional()
  .transform((value) => (value ? value : undefined));

/** POST /account/billing/checkout — which account unlock to start paying for. */
export const planCheckoutSchema = z.object({
  plan: z.enum(["pro", "premium"]),
  discountCode: discountCodeField,
});

/** Optional scratch-card code on checkouts that otherwise have no body. */
export const optionalDiscountCheckoutSchema = z.preprocess(
  (value) => (value && typeof value === "object" ? value : {}),
  z.object({
    discountCode: discountCodeField,
  }),
);

export const discountPreviewSchema = z.object({
  code: z.string().trim().min(1).max(32),
  kind: z.enum(["pro", "premium", "publish", "advanced", "generation_pass"]),
});

/** POST /projects/{id}/domains — connect a hostname the owner already has. */
export const connectDomainSchema = z.object({
  name: z.string().trim().min(1).max(253),
});

