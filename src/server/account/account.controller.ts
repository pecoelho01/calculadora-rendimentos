import { readJsonBody } from "../shared/http/read-json-body";
import { AccountError, type AccountErrorKind } from "./account.errors";
import type { AccountService } from "./account.service";
import {
  createServerTiming,
  type ServerTiming,
} from "../shared/http/server-timing";

export type AccountSession = {
  authenticate(): Promise<{ id: string } | null>;
  service: AccountService;
};
export type AccountSessionFactory = (token: string) => AccountSession | null;

const privateResponseHeaders = {
  "Cache-Control": "private, no-store",
  Vary: "Authorization",
};

function accountResponse(
  body: unknown,
  status = 200,
  extraHeaders?: Record<string, string>,
  timing?: ServerTiming,
) {
  const response = Response.json(body, {
    status,
    headers: { ...privateResponseHeaders, ...extraHeaders },
  });
  return timing ? timing.response(response) : response;
}

type AccountFailureResponse = {
  status: number;
  message: string;
  headers?: Record<string, string>;
};

const failures: Record<AccountErrorKind, AccountFailureResponse> = {
  "invalid-write": {
    status: 400,
    message: "Dados inválidos. Nenhuma alteração foi guardada.",
  },
  "write-too-large": {
    status: 413,
    message: "O pedido excede o tamanho permitido.",
  },
  "invalid-data": {
    status: 400,
    message:
      "Dados inválidos ou limites excedidos. Nenhuma alteração foi guardada.",
  },
  conflict: {
    status: 409,
    message:
      "Esta carteira foi alterada noutro dispositivo. Recarrega os dados antes de repetir a operação.",
  },
  "rate-limit": {
    status: 429,
    message:
      "Demasiadas gravações. Aguarda um minuto antes de tentar novamente.",
    headers: { "Retry-After": "60" },
  },
  "session-expired": {
    status: 401,
    message: "A sessão expirou. Inicia sessão novamente.",
  },
  unavailable: {
    status: 503,
    message: "Não foi possível aceder à conta. Tenta novamente.",
  },
};

async function readAccountInput(request: Request): Promise<unknown> {
  try {
    return await readJsonBody(request, 3_100_000);
  } catch (error) {
    const kind =
      error instanceof RangeError ? "write-too-large" : "invalid-write";
    throw new AccountError(kind);
  }
}

export function createAccountHandler(createSession: AccountSessionFactory) {
  return async function handle(request: Request): Promise<Response> {
    const timing = request.method === "GET" ? createServerTiming() : undefined;
    try {
      const authorization = request.headers.get("authorization");
      const token = authorization?.match(/^Bearer ([^\s]+)$/i)?.[1];
      if (!token)
        return accountResponse(
          { error: "Inicia sessão para aceder às carteiras da conta." },
          401,
          undefined,
          timing,
        );

      const session = createSession(token);
      if (!session)
        return accountResponse(
          { error: "O modo de conta não está configurado." },
          503,
          undefined,
          timing,
        );
      const authenticated = timing
        ? await timing.measure("auth", () => session.authenticate())
        : await session.authenticate();
      if (!authenticated) throw new AccountError("session-expired");

      if (request.method === "POST") {
        const input = await readAccountInput(request);
        return accountResponse(await session.service.apply(input));
      }
      if (request.method !== "GET")
        return accountResponse({ error: "Método não permitido." }, 405);

      const snapshot = timing
        ? await timing.measure("account_read", () => session.service.snapshot())
        : await session.service.snapshot();
      return accountResponse(snapshot, 200, undefined, timing);
    } catch (error) {
      const failure =
        failures[error instanceof AccountError ? error.kind : "unavailable"];
      return accountResponse(
        { error: failure.message },
        failure.status,
        failure.headers,
        timing,
      );
    }
  };
}
