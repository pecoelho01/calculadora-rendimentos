import { test, expect } from "@playwright/test";

test("documentos têm nonce novo, hidratação funcional e bloqueiam scripts sem nonce", async ({ page, request }) => {
  for (const path of ["/", "/conta"]) {
    const first = await request.get(path, { headers: { "x-nonce": "attacker", "Content-Security-Policy": "script-src * 'unsafe-inline'" } });
    const second = await request.get(path);
    const policy = first.headers()["content-security-policy"];
    const nonce = policy.match(/'nonce-([^']+)'/)?.[1];
    expect(nonce).toBeTruthy();
    expect(policy).not.toContain("attacker");
    expect(policy).not.toContain("unsafe-eval");
    expect(policy).not.toBe(second.headers()["content-security-policy"]);
    expect(first.headers()["cache-control"]).toContain("no-store");
    expect(await first.text()).toContain(`nonce="${nonce}"`);
  }

  await page.addInitScript(() => {
    const violations: string[] = [];
    (window as unknown as { cspViolations: string[] }).cspViolations = violations;
    document.addEventListener("securitypolicyviolation", (event) => violations.push(event.effectiveDirective));
  });
  // Inject into the received HTML. DevTools evaluation has privileges that normal
  // parser-inserted scripts do not, so page.evaluate must only observe the result.
  await page.route("/", async (route) => {
    const response = await route.fetch();
    const html = (await response.text())
      .replace("</head>", "<script>document.documentElement.dataset.injected = 'executed'</script></head>")
      .replace("<body>", "<body onload=\"document.documentElement.dataset.handler = 'executed'\">");
    await route.fulfill({ response, body: html });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Continuar sem sessão", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Visão Geral", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations)).toContain("script-src-attr");
  const result = await page.evaluate(() => {
    return {
      injected: document.documentElement.dataset.injected,
      handler: document.documentElement.dataset.handler,
      violations: (window as unknown as { cspViolations: string[] }).cspViolations,
    };
  });
  expect(result.injected).toBeUndefined();
  expect(result.handler).toBeUndefined();
  expect(result.violations).toContain("script-src-elem");
  expect(result.violations).toContain("script-src-attr");
});
