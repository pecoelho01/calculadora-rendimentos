import { expect, type Page } from "@playwright/test";
import { authKey, session } from "./mock-backend";
import { authSurface, waitForPortfolioOverviewRoute } from "./actions";

export async function requestRecovery(page: Page) {
  await page
    .getByRole("button", { name: "Iniciar sessão", exact: true })
    .click();
  await authSurface(page)
    .getByRole("button", { name: "Esqueci a palavra-passe", exact: true })
    .click();
  const dialog = authSurface(page, "Recuperar acesso");
  await dialog.getByLabel("Email", { exact: true }).fill("ana@example.test");
  await dialog
    .getByRole("button", { name: "Enviar ligação", exact: true })
    .click();
  await expect(
    dialog.getByText(/Se existir uma conta com este email/),
  ).toBeVisible();
}

export async function openRecovery(page: Page) {
  await page.goto("/");
  await requestRecovery(page);
  await page.goto("/?code=recovery-test-code&recovery=1");
  const dialog = authSurface(page, "Definir nova palavra-passe");
  await expect(dialog).toBeVisible();
  await waitForPortfolioOverviewRoute(page);
  return dialog;
}

export async function publishAuthSession(
  page: Page,
  next: ReturnType<typeof session>,
  event: "TOKEN_REFRESHED" | "SIGNED_IN",
) {
  // Mirror the real SDK's cross-tab storage + BroadcastChannel protocol.
  await page.evaluate(
    async ({ key, next, event }) => {
      const received = new Promise<void>((resolve) => {
        const listener = new BroadcastChannel(key);
        listener.onmessage = () => {
          listener.close();
          requestAnimationFrame(() => resolve());
        };
      });
      localStorage.setItem(key, JSON.stringify(next));
      const writer = new BroadcastChannel(key);
      writer.postMessage({ event, session: next });
      writer.close();
      await received;
    },
    { key: authKey, next, event },
  );
}
