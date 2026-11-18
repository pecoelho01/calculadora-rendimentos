import { randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm, writeFile, mkdir, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify, stripVTControlCharacters } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const cliVersion = "3.2.0";
const cancellation = new AbortController();
let workdir;
let projectId;
let stackStarting = false;
let webPort;
let runningCommand;

function interrupt(signal) {
  process.exitCode = signal === "SIGINT" ? 130 : 143;
  cancellation.abort();
  runningCommand?.kill(signal);
}

process.on("SIGINT", interrupt);
process.on("SIGTERM", interrupt);

function ensureLoopbackUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("A URL do Supabase local não é válida.");
  }
  if (
    parsed.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("A URL do Supabase tem de apontar para loopback.");
  }
  return parsed.origin;
}

function playwrightFailure(output) {
  const location = output.match(/^\s+at .*?supabase-real\.spec\.ts:(\d+:\d+)/m);
  if (location)
    return `O teste falhou em supabase-real.spec.ts:${location[1]}.`;
  if (/browserType\.launch|Executable doesn't exist/.test(output)) {
    return "O Playwright não conseguiu iniciar o Chromium.";
  }
  if (/config\.webServer|web server/i.test(output)) {
    return "O Playwright não conseguiu iniciar o servidor Next.js.";
  }
  return "O Playwright não concluiu a suite.";
}

function commandFailure(error, diagnostic) {
  // Child output can contain passwords and session tokens. Keep only fixed
  // messages, source coordinates and the migration's filename/SQLSTATE.
  const output = stripVTControlCharacters(
    `${error.stdout ?? ""}\n${error.stderr ?? ""}`,
  );
  if (diagnostic === "playwright") return playwrightFailure(output);
  if (diagnostic === "build" && output.includes("SecurityFatalError")) {
    return "O Next.js interrompeu o build devido a um aviso de segurança da versão instalada.";
  }
  if (diagnostic === "stack") {
    const migration = [
      ...output.matchAll(/Applying migration (\d+_[\w-]+\.sql)/g),
    ].at(-1);
    const sqlState = output.match(/SQLSTATE\s*[:=]?\s*([A-Z0-9]{5})\b/);
    if (migration) {
      const state = sqlState ? ` (SQLSTATE ${sqlState[1]})` : "";
      return `Última migration iniciada: ${migration[1]}${state}.`;
    }
    if (
      /cannot connect to the Docker daemon|failed to inspect docker/i.test(
        output,
      )
    ) {
      return "A CLI não conseguiu contactar o Docker. Verifica se o serviço está disponível.";
    }
    if (
      /pull access denied|failed to (pull|resolve)|error pulling/i.test(output)
    ) {
      return "A CLI não conseguiu descarregar uma imagem Docker.";
    }
    if (/port is already allocated|address already in use/i.test(output)) {
      return "Uma das portas reservadas ficou ocupada durante o arranque.";
    }
  }
  return "";
}

async function run(command, args, { diagnostic, cleanup, ...options } = {}) {
  if (!cleanup) cancellation.signal.throwIfAborted();
  const task = execFileAsync(command, args, {
    cwd: root,
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  if (!cleanup) runningCommand = task.child;
  try {
    return await task;
  } catch (error) {
    const detail = commandFailure(error, diagnostic);
    const status = error.code ?? error.signal ?? "erro";
    throw new Error(
      `Falhou o comando ${command} (${status}).${detail ? ` ${detail}` : ""}`,
    );
  } finally {
    if (!cleanup) runningCommand = undefined;
  }
}

async function cli(args, options) {
  const installedCli = process.env.E2E_SUPABASE_CLI;
  const cliEnvironment = { ...process.env };
  for (const name of Object.keys(cliEnvironment)) {
    if (name.startsWith("SUPABASE_")) delete cliEnvironment[name];
  }
  const localOptions = {
    ...options,
    cwd: workdir,
    env: { ...cliEnvironment, ...options?.env },
  };
  if (installedCli) return run(installedCli, args, localOptions);
  return run("npx", ["--yes", `supabase@${cliVersion}`, ...args], localOptions);
}

async function verifyCliVersion() {
  const { stdout } = await cli(["--version"]);
  const version = stdout.match(/\d+\.\d+\.\d+/)?.[0];
  if (version !== cliVersion) {
    throw new Error(
      `Esperada Supabase CLI ${cliVersion}; recebida ${version ?? "desconhecida"}.`,
    );
  }
}

async function availablePorts(count) {
  const servers = [];
  const ports = [];

  try {
    for (let index = 0; index < count; index += 1) {
      const server = createServer();
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Não foi possível reservar uma porta local.");
      }
      servers.push(server);
      ports.push(address.port);
    }
  } finally {
    await Promise.all(
      servers.map((server) => new Promise((resolve) => server.close(resolve))),
    );
  }

  return ports;
}

async function prepareProject() {
  workdir = await mkdtemp(join(tmpdir(), "rendimentos-supabase-e2e-"));
  await verifyCliVersion();
  const [apiPort, databasePort, shadowPort, applicationPort, mailpitPort] =
    await availablePorts(5);
  webPort = applicationPort;

  const supabaseDirectory = join(workdir, "supabase");
  await mkdir(supabaseDirectory, { recursive: true });
  projectId = `rendimentos-${randomUUID()}`;
  const config = `project_id = "${projectId}"

[api]
enabled = true
port = ${apiPort}
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000

[db]
port = ${databasePort}
shadow_port = ${shadowPort}
major_version = 17

[db.seed]
enabled = false

[auth]
enabled = true
site_url = "http://127.0.0.1:${applicationPort}"
additional_redirect_urls = ["http://127.0.0.1:${applicationPort}/**"]
enable_signup = true
jwt_expiry = 3600

[auth.email]
enable_signup = true
enable_confirmations = true

[local_smtp]
enabled = true
port = ${mailpitPort}
`;
  await writeFile(join(supabaseDirectory, "config.toml"), config);

  const migrationsPath = join(supabaseDirectory, "migrations");
  await cp(join(root, "supabase", "migrations"), migrationsPath, {
    recursive: true,
  });
}

function parseEnvironment(output) {
  const values = {};
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}

async function startStack() {
  cancellation.signal.throwIfAborted();
  stackStarting = true;
  await cli(
    [
      "start",
      "--workdir",
      workdir,
      "-x",
      "realtime,storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor",
    ],
    { diagnostic: "stack" },
  );
  const { stdout } = await cli(["status", "--workdir", workdir, "-o", "env"]);
  const values = parseEnvironment(stdout);
  const url = values.API_URL ?? values.SUPABASE_URL;
  const publishableKey = values.PUBLISHABLE_KEY ?? values.ANON_KEY;
  const serviceRoleKey = values.SERVICE_ROLE_KEY;
  const mailpitUrl = values.MAILPIT_URL;
  if (!url || !publishableKey || !serviceRoleKey || !mailpitUrl) {
    throw new Error("A CLI não devolveu a configuração local esperada.");
  }
  return {
    url: ensureLoopbackUrl(url),
    publishableKey,
    serviceRoleKey,
    mailpitUrl: ensureLoopbackUrl(mailpitUrl),
  };
}

async function createSyntheticUsers({ url, serviceRoleKey }) {
  const randomPart = randomUUID();
  const password = `${randomBytes(32).toString("base64url")}Aa1!`;
  const users = ["a", "b"].map((suffix) => ({
    email: `e2e-${suffix}-${randomPart}@example.invalid`,
    password,
  }));

  for (const user of users) {
    const response = await fetch(`${url}/auth/v1/admin/users`, {
      method: "POST",
      redirect: "error",
      signal: cancellation.signal,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: user.email,
        password: user.password,
        email_confirm: true,
      }),
    });
    if (!response.ok) {
      throw new Error(
        `Não foi possível criar utilizador sintético (${response.status}).`,
      );
    }
  }

  return users;
}

function applicationEnvironment(url, publishableKey) {
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) {
    if (name.startsWith("SUPABASE_")) delete environment[name];
  }
  delete environment.E2E_SUPABASE_USER_A_EMAIL;
  delete environment.E2E_SUPABASE_USER_A_PASSWORD;
  delete environment.E2E_SUPABASE_USER_B_EMAIL;
  delete environment.E2E_SUPABASE_USER_B_PASSWORD;
  delete environment.E2E_SUPABASE_CLI;
  environment.NEXT_PUBLIC_SUPABASE_URL = url;
  environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = publishableKey;
  environment.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "";
  delete environment.E2E_MAILPIT_URL;
  return environment;
}

async function runPlaywright({
  configuration,
  users,
  mailpitUrl,
  port,
  outputDir,
}) {
  const environment = {
    ...configuration,
    PLAYWRIGHT_PORT: String(port),
    PLAYWRIGHT_OUTPUT_DIR: outputDir,
    E2E_SUPABASE_USER_A_EMAIL: users[0].email,
    E2E_SUPABASE_USER_A_PASSWORD: users[0].password,
    E2E_SUPABASE_USER_B_EMAIL: users[1].email,
    E2E_SUPABASE_USER_B_PASSWORD: users[1].password,
    E2E_MAILPIT_URL: mailpitUrl,
  };
  const { stdout } = await run(
    process.execPath,
    [
      "node_modules/@playwright/test/cli.js",
      "test",
      "--config=config/playwright.supabase-real.config.ts",
    ],
    { env: environment, diagnostic: "playwright" },
  );
  const summary = stdout.match(/\d+ passed(?: \([^\n]+\))?/);
  if (summary) process.stdout.write(`Playwright: ${summary[0]}\n`);
}

async function stopStack() {
  if (!stackStarting) return;
  try {
    await cli(["stop", "--workdir", workdir, "--no-backup"], { cleanup: true });
  } catch {
    process.exitCode ||= 1;
    process.stderr.write(
      `Não foi possível parar a stack. No mesmo Docker, executa supabase stop --project-id ${projectId} --no-backup.\n`,
    );
  }
}

let stage = "preparação";
try {
  process.stdout.write(
    `Supabase CLI ${cliVersion}: preparar projeto isolado\n`,
  );
  await prepareProject();
  stage = "stack Supabase local";
  process.stdout.write(
    "Iniciar Auth/PostgREST/Postgres e aplicar migrations\n",
  );
  const configuration = await startStack();
  stage = "criação de utilizadores sintéticos";
  process.stdout.write("Criar duas contas sintéticas confirmadas\n");
  const users = await createSyntheticUsers(configuration);
  const environment = applicationEnvironment(
    configuration.url,
    configuration.publishableKey,
  );
  stage = "build da aplicação";
  process.stdout.write("Compilar aplicação com Supabase local\n");
  await run("npm", ["run", "build"], { env: environment, diagnostic: "build" });
  stage = "Playwright";
  process.stdout.write("Executar fluxos Playwright de conta local\n");
  await runPlaywright({
    configuration: environment,
    users,
    mailpitUrl: configuration.mailpitUrl,
    port: webPort,
    outputDir: join(workdir, "playwright-output"),
  });
} catch (error) {
  if (cancellation.signal.aborted) {
    process.stderr.write(`Execução interrompida na etapa ${stage}.\n`);
  } else {
    process.stderr.write(`Falha na etapa ${stage}: ${error.message}\n`);
    process.exitCode = 1;
  }
} finally {
  await stopStack();
  if (workdir) await rm(workdir, { recursive: true, force: true });
}
