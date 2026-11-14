export type AuthErrorCode =
  | "invalid_request"
  | "invalid_credentials"
  | "session_expired"
  | "session_changed"
  | "invalid_callback"
  | "reauthentication_needed"
  | "reauthentication_not_valid"
  | "rate_limit"
  | "unavailable";

const messages: Record<AuthErrorCode, string> = {
  invalid_request:
    "O pedido de conta é inválido. Verifica os dados e tenta novamente.",
  invalid_credentials:
    "Não foi possível iniciar sessão. Verifica o email e a palavra-passe.",
  session_expired: "A sessão expirou. Inicia sessão novamente.",
  session_changed:
    "A sessão da conta mudou. Recarrega os dados antes de repetir a operação.",
  invalid_callback:
    "Não foi possível validar esta ligação. Pede uma nova ligação e abre-a no mesmo navegador onde iniciaste o pedido.",
  reauthentication_needed:
    "É necessário um código de confirmação para alterar a palavra-passe.",
  reauthentication_not_valid: "O código de confirmação é inválido ou expirou.",
  rate_limit: "Demasiados pedidos de conta. Aguarda antes de tentar novamente.",
  unavailable: "Não foi possível aceder à conta. Tenta novamente mais tarde.",
};

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    readonly status = 400,
  ) {
    super(messages[code]);
  }
}
