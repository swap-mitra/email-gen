export type DeliveryErrorReason =
  | "no_account"
  | "insufficient_scope"
  | "invalid_token"
  | "not_configured"
  | "upstream_error";

/** Typed failure from a delivery provider — carries enough detail for the
 * API route to pick an appropriate HTTP status and user-facing message. */
export class DeliveryError extends Error {
  constructor(
    public reason: DeliveryErrorReason,
    message: string,
  ) {
    super(message);
    this.name = "DeliveryError";
  }
}
