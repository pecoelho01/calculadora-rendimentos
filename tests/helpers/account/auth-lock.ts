import type { Page } from "@playwright/test";

const AUTH_MUTATION_LOCK = "rendimentos.auth.mutation.v1";

type AuthLockWindow = Window & { authLockRequests: number };

export async function isAuthMutationLockHeld(page: Page) {
  return page.evaluate(async (lockName) => {
    const locks = await navigator.locks.query();
    return Boolean(locks.held?.some((lock) => lock.name === lockName));
  }, AUTH_MUTATION_LOCK);
}

/**
 * Counts requests for the Auth mutation lock, so a test can prove a refresh was
 * attempted (and queued behind the lock) before asserting that no Auth request
 * was sent. Call before the first navigation.
 */
export async function countAuthLockRequests(page: Page) {
  await page.addInitScript((lockName) => {
    const locks = navigator.locks;
    const originalRequest = locks.request.bind(locks);
    (window as unknown as AuthLockWindow).authLockRequests = 0;
    locks.request = ((...args: Parameters<typeof locks.request>) => {
      if (args[0] === lockName)
        (window as unknown as AuthLockWindow).authLockRequests++;
      return originalRequest(...args);
    }) as typeof locks.request;
  }, AUTH_MUTATION_LOCK);
}

export async function readAuthLockRequests(page: Page) {
  return page.evaluate(
    () => (window as unknown as AuthLockWindow).authLockRequests,
  );
}
