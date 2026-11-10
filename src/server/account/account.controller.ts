import { readJsonBody } from "../shared/http/read-json-body";
import { AccountError, type AccountErrorKind } from "./account.errors";
import type { AccountService } from "./account.service";

export type AccountSession = {
  authenticate(): Promise<{ id: string } | null>;
  service: AccountService;
};
export type AccountSessionFactory = (token: string) => AccountSession | null;

const headers = { "Cache-Control": "private, no-store", "Vary": "Authorization" };
function response(body: unknown, status = 200, extraHeaders?: Record<string, string>) {
  return Response.json(body, { status, headers: { ...headers, ...extraHeaders } });
}
const failures: Record<AccountErrorKind, { status: number; message: string; headers?: Record<string, string> }> = {
  "invalid-write": { status: 400, message: "Dados inválidos. Nenhuma alteração foi guardada." },
  "write-too-large": { status: 413, message: "O pedido excede o tamanho permitido." },
  "invalid-data": { status: 400, message: "Dados inválidos ou limites excedidos. Nenhuma alteração foi guardada." },
  conflict: { status: 409, message: "Esta carteira foi alterada noutro dispositivo. Recarrega os dados antes de repetir a operação." },
  "rate-limit": { status: 429, message: "Demasiadas gravações. Aguarda um minuto antes de tentar novamente.", headers: { "Retry-After": "60" } },
  "session-expired": { status: 401, message: "A sessão expirou. Inicia sessão novamente." },
  unavailable: { status: 503, message: "Não foi possível aceder à conta. Tenta novamente." },
};

export function createAccountHandler(createSession: AccountSessionFactory) {
  return async function handle(request: Request): Promise<Response> {
    try {
      const token = request.headers.get("authorization")?.match(/^Bearer ([^\s]+)$/i)?.[1];
      if (!token) return response({ error: "Inicia sessão para aceder às carteiras da conta." }, 401);
      const session = createSession(token);
      if (!session) return response({ error: "O modo de conta não está configurado." }, 503);
      if (!await session.authenticate()) throw new AccountError("session-expired");
      if (request.method === "POST") {
        let input: unknown;
        try {
          input = await readJsonBody(request, 3_100_000);
        } catch (error) {
          throw new AccountError(error instanceof RangeError ? "write-too-large" : "invalid-write");
        }
        return response(await session.service.apply(input));
      }
      if (request.method !== "GET") return response({ error: "Método não permitido." }, 405);
      return response(await session.service.snapshot());
    } catch (error) {
      const failure = failures[error instanceof AccountError ? error.kind : "unavailable"];
      return response({ error: failure.message }, failure.status, failure.headers);
    }
  };
}
