/**
 * @file Detects a proxy login redirect and reloads past the service worker
 */

/** sessionStorage key for the last reload time. */
const PROXY_RELOAD_AT_KEY = "proxy-sso:reload-at";

/** Minimum gap between reloads, so a misconfigured proxy can't loop. */
const PROXY_RELOAD_COOLDOWN_MS = 60_000;

/** Fetch options that surface a proxy redirect instead of a CORS error. */
export const PROXY_AWARE_FETCH_INIT = { redirect: "manual" } as const satisfies RequestInit;

/** Options for {@link recoverFromProxyRedirect}. */
export interface IRecoverOptions {
  /** Builds the error thrown when recovery gives up. */
  createGiveUpError?: () => Error;
}

/**
 * Whether an API response is a redirect, meaning the proxy wants a login.
 * @param res - the fetch response
 * @returns true for a redirect
 */
export function isProxyRedirect(res: Response): boolean {
  return res.type === "opaqueredirect" || res.redirected;
}

/**
 * Unregisters service workers and clears caches where allowed, then reloads.
 * @returns never resolves
 */
export async function clearServiceWorkerAndReload(): Promise<never> {
  await Promise.allSettled([unregisterServiceWorkers(), clearCaches()]);
  window.location.reload();
  return new Promise<never>(() => {});
}

/**
 * Unregisters every service worker for this origin.
 * @returns resolves when done; rejects if the browser refuses
 */
async function unregisterServiceWorkers(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
}

/**
 * Deletes every Cache Storage cache for this origin.
 * @returns resolves when done; rejects if the browser refuses
 */
async function clearCaches(): Promise<void> {
  if (!("caches" in window)) return;
  const keys = await caches.keys();
  await Promise.all(keys.map((key) => caches.delete(key)));
}

/**
 * Records a reload unless one happened within the cooldown.
 * @returns true when a reload may go ahead
 */
function claimReload(): boolean {
  try {
    const lastReloadAt = Number(sessionStorage.getItem(PROXY_RELOAD_AT_KEY) ?? 0);
    const elapsed = Date.now() - lastReloadAt;
    // A future timestamp means the clock moved back.
    if (elapsed >= 0 && elapsed < PROXY_RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(PROXY_RELOAD_AT_KEY, String(Date.now()));
    return true;
  } catch {
    // Without storage nothing stops a reload loop.
    return false;
  }
}

/**
 * Reloads past the service worker so the proxy can show its login, or gives up within the cooldown.
 * @param options - how to report giving up
 * @returns never resolves when reloading; rejects when giving up
 */
export async function recoverFromProxyRedirect(options: IRecoverOptions = {}): Promise<never> {
  if (!claimReload()) {
    throw options.createGiveUpError?.() ?? new Error("Sign-in required - reload the page");
  }
  return clearServiceWorkerAndReload();
}
