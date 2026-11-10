/** Application failures; HTTP status and SQLSTATE belong to the outer layers. */
export type AccountErrorKind =
  | "invalid-write"
  | "write-too-large"
  | "invalid-data"
  | "conflict"
  | "rate-limit"
  | "session-expired"
  | "unavailable";

export class AccountError extends Error {
  constructor(readonly kind: AccountErrorKind) {
    super(kind);
    this.name = "AccountError";
  }
}
