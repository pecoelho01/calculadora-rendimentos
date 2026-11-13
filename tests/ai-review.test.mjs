import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ENDPOINT,
  MARKER,
  hasSensitiveContent,
  runReview,
  selectContext,
} from "../scripts/ai-review.mjs";

const event = {
  repository: { full_name: "owner/repo" },
  pull_request: {
    number: 1,
    user: { login: "author" },
    head: { sha: "a".repeat(40), repo: { full_name: "owner/repo" } },
  },
};
const patch = { filename: "src/example.ts", patch: "@@ -1 +1 @@\n-old\n+new" };
const result = {
  changeSummary: "Simplificar a implementação observada.",
  affectedAreas: "Módulo src/example.ts.",
  expectedImpact:
    "O contexto não permite confirmar alterações de comportamento.",
  summary: "Clareza adequada.",
  findings: [
    {
      severity: "média",
      path: patch.filename,
      line: 1,
      explanation: "Problema concreto",
      suggestion: "Simplificar",
    },
  ],
  positives: ["Responsabilidade clara"],
};

async function scenario({
  input = event,
  env = { GITHUB_TOKEN: "github", OPENROUTER_API_KEY: "test" },
  status = 200,
  networkError = false,
  content = JSON.stringify(result),
  existing = false,
  stale = false,
  files = [patch],
} = {}) {
  const calls = [];
  const summaries = [];
  await runReview({
    event: input,
    env,
    summary: (text) => summaries.push(text),
    request: async (url, options) => {
      calls.push({ url, ...options });
      let data;
      if (url === ENDPOINT && networkError)
        throw new DOMException("Timeout", "TimeoutError");
      if (url === ENDPOINT) data = { choices: [{ message: { content } }] };
      else if (url.includes("/files?")) data = files;
      else if (url.includes("/comments?") && options.method === "GET")
        data = existing
          ? [{ id: 42, body: MARKER, user: { login: "github-actions[bot]" } }]
          : [];
      else if (options.method === "GET")
        data = {
          head: { sha: stale ? "b".repeat(40) : input.pull_request.head.sha },
          state: "open",
        };
      else data = {};
      return { ok: url !== ENDPOINT || status === 200, json: async () => data };
    },
  });
  return { calls, summaries };
}

test("fixed free endpoint/model and one request; update the existing bot comment", async () => {
  const { calls } = await scenario({ existing: true });
  const modelCalls = calls.filter((call) => call.url === ENDPOINT);
  assert.equal(modelCalls.length, 1);
  const body = JSON.parse(modelCalls[0].body);
  assert.equal(body.model, "openrouter/free");
  assert.deepEqual(body.provider.max_price, { prompt: 0, completion: 0 });
  assert.equal(body.provider.allow_fallbacks, false);
  assert.equal(body.provider.data_collection, "deny");
  assert.equal(body.models, undefined);
  assert.ok(modelCalls[0].signal instanceof AbortSignal);
  assert.equal(modelCalls[0].redirect, "error");
  assert.equal(calls.at(-1).method, "PATCH");
  assert.match(calls.at(-1).body, /src\/example.ts:1/);
  assert.equal(calls.at(-1).headers.Authorization, "Bearer github");
  assert.ok(!calls.at(-1).body.includes("Bearer test"));
});

test("skip forks, Dependabot and missing secret without model calls", async () => {
  for (const options of [
    {
      input: {
        ...event,
        pull_request: {
          ...event.pull_request,
          head: {
            ...event.pull_request.head,
            repo: { full_name: "fork/repo" },
          },
        },
      },
    },
    {
      input: {
        ...event,
        pull_request: {
          ...event.pull_request,
          user: { login: "dependabot[bot]" },
        },
      },
    },
    { env: { GITHUB_TOKEN: "github" } },
  ]) {
    const { calls, summaries } = await scenario(options);
    assert.ok(!calls.some((call) => call.url === ENDPOINT));
    assert.match(summaries[0], /ignorada/);
    assert.equal(calls.at(-1).method, "POST");
  }
});

test("API failure and malformed responses are informative, without retry", async () => {
  for (const options of [
    { status: 429 },
    { status: 503 },
    { content: "invalid" },
    { networkError: true },
  ]) {
    const { calls, summaries } = await scenario(options);
    assert.equal(calls.filter((call) => call.url === ENDPOINT).length, 1);
    assert.match(summaries[0], /indisponível/);
  }
});

test("sensitive files/content and oversized patches are excluded with bounded context", () => {
  assert.ok(hasSensitiveContent('api_key = "super-secret-value"'));
  const files = [
    { ...patch, filename: ".env" },
    { ...patch, filename: "src/private-key.ts" },
    { ...patch, patch: '+const password = "my-password";' },
    { ...patch, patch: "x".repeat(6001) },
    ...Array.from({ length: 30 }, (_, index) => ({
      filename: `src/file${index}.ts`,
      patch: "x".repeat(3000),
    })),
  ];
  const selected = selectContext(files);
  assert.ok(selected.length > 0 && selected.length <= 12);
  assert.ok(JSON.stringify(selected).length < 24100);
  assert.ok(selected.every((file) => file.path.startsWith("src/file")));
});

test("empty context skips model; stale results never publish", async () => {
  const empty = await scenario({ files: [] });
  assert.ok(!empty.calls.some((call) => call.url === ENDPOINT));
  const stale = await scenario({ stale: true });
  assert.ok(
    !stale.calls.some(
      (call) =>
        ["POST", "PATCH"].includes(call.method) && call.url !== ENDPOINT,
    ),
  );
});

test("invalid locations are discarded and model HTML/mentions are neutralized", async () => {
  const content = JSON.stringify({
    ...result,
    summary: "<img> @user [external](https://example.com)",
    findings: [{ ...result.findings[0], line: 999 }],
  });
  const { calls } = await scenario({ content });
  const body = JSON.parse(calls.at(-1).body).body;
  assert.ok(
    !body.includes("<img>") &&
      !body.includes("@user") &&
      !body.includes("https://example.com"),
  );
  assert.ok(!body.includes(":999"));
});

test("change summary precedes quality and shares the single model request/comment", async () => {
  const { calls, summaries } = await scenario({ existing: true });
  const body = JSON.parse(calls.at(-1).body).body;
  assert.ok(
    body.indexOf("### Resumo das alterações") <
      body.indexOf("### Qualidade geral"),
  );
  assert.ok(body.includes(result.changeSummary));
  assert.ok(body.includes(`**Áreas afetadas:** ${result.affectedAreas}`));
  assert.ok(body.includes(`**Impacto esperado:** ${result.expectedImpact}`));
  assert.match(body, /pode cobrir apenas parte do PR/);
  assert.ok(summaries[0].includes(result.changeSummary));
  assert.equal(calls.filter((call) => call.url === ENDPOINT).length, 1);
  assert.equal(calls.filter((call) => call.method === "PATCH").length, 1);
});

test("summary fields are sanitized and missing/invalid fields fail without retry", async () => {
  const content = JSON.stringify({
    ...result,
    changeSummary: "<img> @user [external](https://example.com)",
    affectedAreas: 'api_key = "super-secret-value"',
    expectedImpact: "x".repeat(2000),
  });
  const { calls } = await scenario({ content });
  const body = JSON.parse(calls.at(-1).body).body;
  assert.ok(
    !body.includes("<img>") &&
      !body.includes("@user") &&
      !body.includes("https://example.com"),
  );
  assert.ok(!body.includes("super-secret-value"));
  assert.ok(body.includes("Texto omitido por segurança."));
  assert.ok(!body.includes("x".repeat(1201)));
  for (const field of ["changeSummary", "affectedAreas", "expectedImpact"]) {
    for (const value of [undefined, []]) {
      const invalid = await scenario({
        content: JSON.stringify({ ...result, [field]: value }),
      });
      assert.match(invalid.summaries[0], /indisponível/);
      assert.equal(
        invalid.calls.filter((call) => call.url === ENDPOINT).length,
        1,
      );
    }
  }
});

test("secret detection retains keys, credential assignments, PEM markers and JWTs", () => {
  const sensitive = [
    "-----BEGIN RSA PRIVATE KEY-----",
    "-----BEGIN EC PRIVATE KEY-----",
    "ghp_" + "a".repeat(36),
    "github_pat_" + "a".repeat(36),
    "sk-" + "a".repeat(24),
    "AKIA" + "A".repeat(16),
    'api_key = "example-value"',
    '"password" : "example-value"',
    "secret = `example-value`",
    "refresh_token" + " ".repeat(50000) + '= "example-value"',
    "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature",
  ];
  for (const value of sensitive) assert.equal(hasSensitiveContent(value), true);
  for (const value of [
    "const amount = 42;",
    "eyJheader.payload",
    "eyJheader payload.signature",
    "eyJheader.payload signature",
    "secret" + " ".repeat(50000) + "without an assignment",
    ("-----BEGIN PUBLIC KEY----- " + "-eyJ".repeat(1000)).repeat(10),
  ])
    assert.equal(hasSensitiveContent(value), false);
});

test("model JSON supports plain content and Markdown fences with long whitespace", async () => {
  const json = JSON.stringify(result);
  for (const content of [
    json,
    `\n\t${json}  \n`,
    `\n\`\`\`json\n${json}\n\`\`\`\n`,
    `\`\`\`\n${json}${" ".repeat(50000)}\`\`\``,
  ]) {
    const { calls, summaries } = await scenario({ content });
    assert.ok(summaries[0].includes(result.changeSummary));
    assert.equal(calls.filter((call) => call.url === ENDPOINT).length, 1);
  }
  const invalid = await scenario({
    content: `\`\`\`json\ninvalid${" ".repeat(50000)}\`\`\``,
  });
  assert.match(invalid.summaries[0], /indisponível/);
});
