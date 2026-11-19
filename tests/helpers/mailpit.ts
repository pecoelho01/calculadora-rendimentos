import { setTimeout as delay } from "node:timers/promises";

const POLL_DEADLINE_MS = 20_000;
const REQUEST_TIMEOUT_MS = 2_000;
const POLL_INTERVAL_MS = 250;

type MailpitAddress = { Address?: string };

type MailpitSearchResult = {
  messages?: { ID: string; To?: MailpitAddress[] }[];
};

type MailpitMessage = {
  HTML?: string;
  Text?: string;
  To?: MailpitAddress[];
};

const HTML_ENTITIES: Readonly<Record<string, string>> = {
  "&amp;": "&",
  "&quot;": '"',
  "&#x3D;": "=",
};

function requestSignal(deadline: AbortSignal): AbortSignal {
  return AbortSignal.any([deadline, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]);
}

function verificationLink(
  message: MailpitMessage,
  authOrigin: string,
  appOrigin: string,
): string {
  const html = (message.HTML ?? "").replace(
    /&(?:amp|quot|#x3D);/g,
    (entity) => HTML_ENTITIES[entity],
  );
  const content = `${html}\n${message.Text ?? ""}`;
  const candidates = content.match(/https?:\/\/[^\s"'<>]+/g) ?? [];

  for (const candidate of candidates) {
    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      continue;
    }
    if (
      url.origin === authOrigin &&
      url.pathname === "/auth/v1/verify" &&
      url.searchParams.get("type") === "signup" &&
      url.searchParams.get("token")
    ) {
      const redirect = url.searchParams.get("redirect_to");
      if (
        !redirect ||
        !URL.canParse(redirect) ||
        new URL(redirect).href !== `${appOrigin}/`
      ) {
        throw new Error(
          "A ligação de confirmação não redireciona para a aplicação local.",
        );
      }
      return url.href;
    }
  }

  throw new Error(
    "O email local não contém a ligação de confirmação esperada.",
  );
}

export async function waitForSignupVerification(
  mailpitUrl: string,
  recipient: string,
  authOrigin: string,
  appOrigin: string,
): Promise<string> {
  const deadline = AbortSignal.timeout(POLL_DEADLINE_MS);
  const baseUrl = new URL(mailpitUrl);
  const searchUrl = new URL("/api/v1/search", baseUrl);
  searchUrl.searchParams.set("query", `to:"${recipient}"`);

  try {
    while (!deadline.aborted) {
      const searchResponse = await fetch(searchUrl, {
        signal: requestSignal(deadline),
        redirect: "error",
      });

      if (!searchResponse.ok) {
        throw new Error(
          "Mailpit local não respondeu à pesquisa da caixa de entrada.",
        );
      }

      const result = (await searchResponse.json()) as MailpitSearchResult;
      const match = result.messages?.find((message) =>
        message.To?.some((address) => address.Address === recipient),
      );
      if (!match) {
        await delay(POLL_INTERVAL_MS, undefined, { signal: deadline });
        continue;
      }

      const messageUrl = new URL(
        `/api/v1/message/${encodeURIComponent(match.ID)}`,
        baseUrl,
      );
      const messageResponse = await fetch(messageUrl, {
        signal: requestSignal(deadline),
        redirect: "error",
      });

      if (!messageResponse.ok) {
        throw new Error("Mailpit local não devolveu o email de confirmação.");
      }

      const message = (await messageResponse.json()) as MailpitMessage;
      if (!message.To?.some((address) => address.Address === recipient)) {
        throw new Error(
          "O destinatário da mensagem não corresponde ao registo.",
        );
      }
      return verificationLink(message, authOrigin, appOrigin);
    }
  } catch (error) {
    if (!deadline.aborted) throw error;
  }

  throw new Error(
    "O email de confirmação não chegou ao Mailpit dentro do prazo.",
  );
}
