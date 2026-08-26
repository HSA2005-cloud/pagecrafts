export type ErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  // The caller's precondition no longer holds — it is writing over a version of the thing
  // that someone else has already replaced. Distinct from validation_failed: the request is
  // well formed and would have succeeded a moment ago (R3 D6).
  | "conflict"
  | "rate_limited"
  | "spend_capped"
  | "validation_failed"
  | "brief_unclear"
  | "payload_too_large"
  | "generation_failed"
  | "payment_required"
  | "payments_unavailable"
  | "invalid_discount"
  | "hosting_error"
  | "service_unavailable"
  | "internal";