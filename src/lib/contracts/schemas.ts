import { z } from "zod";

// Runtime request validators for the persistence routes. Kept aligned with the
// TypeScript contracts in this folder; Zod guards the HTTP boundary (M0.2).

export const createProjectSchema = z.object({
  name: z.string().min(1).max(80),
  sourceTemplateId: z.string().uuid().optional(),
  mode: z.literal("generate").optional(),
  prompt: z.string().max(500).optional(),
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
  gstin: z.string().trim().max(15),
});

// POST /plans/checkout — which plan to buy. Only the paid plans are purchasable; the price
// is read from the catalogue on the server, never from this body (R-plans).
export const planCheckoutSchema = z.object({
  plan: z.enum(["pro", "premium"]),
});

// POST /plans/verify — the three values Razorpay Checkout hands the browser on success. The
// signature is what the server recomputes; the ids name the order and payment it covers.
export const planVerifySchema = z.object({
  razorpayOrderId: z.string().min(1).max(64),
  razorpayPaymentId: z.string().min(1).max(64),
  razorpaySignature: z.string().min(1).max(256),
});

