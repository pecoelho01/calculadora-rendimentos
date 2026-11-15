import { pathToFileURL } from "node:url";

function deploymentOrigin(origin) {
  const url = new URL(origin);
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) ||
    url.origin !== origin ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "O smoke test exige uma origem HTTPS, ou HTTP em loopback.",
    );
  }
  return url;
}

async function checkPage(response) {
  if (
    !response.ok ||
    !response.headers.get("content-type")?.includes("text/html")
  ) {
    throw new Error("A página inicial não devolveu HTML válido.");
  }
  const html = await response.text();
  if (!html.includes("<html") || !html.includes("<body")) {
    throw new Error("A página inicial está incompleta.");
  }
}

export async function checkDeployment(origin, revision, request = fetch) {
  const url = deploymentOrigin(origin);
  if (revision && !/^[a-f0-9]{40}$/.test(revision)) {
    throw new Error("A revisão esperada deve ser um SHA completo.");
  }

  async function get(path) {
    return request(new URL(path, url), {
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  }

  await checkPage(await get("/"));

  const account = await get("/api/account");
  if (
    account.status !== 401 ||
    !account.headers.get("cache-control")?.includes("no-store")
  ) {
    throw new Error("A API de conta não protegeu o pedido sem sessão.");
  }
  const health = await get("/api/health");
  if (!health.ok)
    throw new Error("O contrato da base de dados está indisponível.");
  const body = await health.json();
  if (
    body?.status !== "ok" ||
    !["enabled", "disabled"].includes(body.account) ||
    (revision && body.revision !== revision)
  ) {
    throw new Error(
      "O estado ou a revisão publicada não corresponde ao deployment.",
    );
  }
}

export async function waitForPublishedRevision(
  origin,
  revision,
  { request = fetch, pause = wait, attempts = 40 } = {},
) {
  const url = deploymentOrigin(origin);
  if (!/^[a-f0-9]{40}$/.test(revision)) {
    throw new Error("A revisão esperada deve ser um SHA completo.");
  }
  // A ready build may still be waiting for Deployment Checks and its domains.
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await request(new URL("/api/health", url), {
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      const body = await response.json();
      if (body?.revision === revision) return;
    } catch {
      // A temporary response does not establish that the expected SHA is live.
    }
    if (attempt + 1 < attempts) await pause(15_000);
  }
  throw new Error("A revisão esperada não chegou ao domínio de produção.");
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    if (process.env.SMOKE_REVISION) {
      await waitForPublishedRevision(
        process.env.SMOKE_URL,
        process.env.SMOKE_REVISION,
      );
    }
    await checkDeployment(process.env.SMOKE_URL, process.env.SMOKE_REVISION);
    console.log(
      "Smoke: página, API sem sessão e contrato da conta verificados.",
    );
  } catch {
    console.error(
      "Smoke do deployment falhou; verificar a publicação e o contrato da BD.",
    );
    process.exitCode = 1;
  }
}
