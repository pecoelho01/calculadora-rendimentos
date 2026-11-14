import { AuthError } from "./auth.errors";
import type { AuthAction, AuthInput } from "./auth.types";

const fields: Record<AuthAction, string[]> = {
  login: ["email", "password", "captchaToken"],
  register: ["email", "password", "captchaToken"],
  recover: ["email", "captchaToken"],
  password: ["password", "nonce", "sessionKey"],
  reauthenticate: ["sessionKey"],
  logout: ["sessionKey"],
  session: ["sessionKey"],
  refresh: ["sessionKey"],
  callback: ["code"],
};

export function validateAuthInput(
  action: AuthAction,
  value: unknown,
): AuthInput {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AuthError("invalid_request");
  const input = value as AuthInput;
  if (Object.keys(input).some((key) => !fields[action].includes(key)))
    throw new AuthError("invalid_request");
  for (const [key, item] of Object.entries(input)) {
    if (
      typeof item !== "string" ||
      item.length > (key === "captchaToken" ? 8_192 : 4_096)
    )
      throw new AuthError("invalid_request");
  }
  if (action === "login" || action === "register" || action === "recover") {
    const email = typeof input.email === "string" ? input.email.trim() : "";
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new AuthError("invalid_request");
    input.email = email;
    if (
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() &&
      !input.captchaToken
    )
      throw new AuthError("invalid_request");
  }
  if (action === "login" || action === "register" || action === "password") {
    const minimum = action === "login" ? 1 : 8;
    if (
      typeof input.password !== "string" ||
      input.password.length < minimum ||
      input.password.length > 128
    )
      throw new AuthError("invalid_request");
  }
  if (
    action === "callback" &&
    (typeof input.code !== "string" || !input.code || input.code.length > 4_096)
  )
    throw new AuthError("invalid_callback");
  return input;
}
