// Shared by the server guard and browser callback rejection. Never include values.
export const AUTH_TOKEN_FIELDS = [
  "access_token", "refresh_token", "token_type", "expires_in", "expires_at",
  "provider_token", "provider_refresh_token",
] as const;
export const AUTH_ERROR_FIELDS = ["error", "error_code", "error_description"] as const;
export const AUTH_CALLBACK_FIELDS = [
  ...AUTH_TOKEN_FIELDS, ...AUTH_ERROR_FIELDS, "code", "recovery", "type", "sb_flow_id",
] as const;
