/**
 * @file Detects a proxy login redirect and reloads past the service worker
 */
/** sessionStorage key for the last reload time. */
const PROXY_RELOAD_AT_KEY = "proxy-sso:reload-at";
/** Minimum gap between reloads, so a misconfigured proxy can't loop. */
const PROXY_RELOAD_COOLDOWN_MS = 60_000;
/** Fetch options that surface a proxy redirect instead of a CORS error. */
export const PROXY_AWARE_FETCH_INIT = { redirect: "manual" };
/**
 * Whether an API response is a redirect, meaning the proxy wants a login.
 * @param res - the fetch response
 * @returns true for a redirect
 */
export function isProxyRedirect(res) {
    return res.type === "opaqueredirect" || res.redirected;
}
/**
 * Unregisters service workers and clears caches where allowed, then reloads.
 * @returns never resolves
 */
export async function clearServiceWorkerAndReload() {
    await Promise.allSettled([unregisterServiceWorkers(), clearCaches()]);
    window.location.reload();
    return new Promise(() => { });
}
/**
 * Unregisters every service worker for this origin.
 * @returns resolves when done; rejects if the browser refuses
 */
async function unregisterServiceWorkers() {
    if (!("serviceWorker" in navigator))
        return;
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
}
/**
 * Deletes every Cache Storage cache for this origin.
 * @returns resolves when done; rejects if the browser refuses
 */
async function clearCaches() {
    if (!("caches" in window))
        return;
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
}
/**
 * Records a reload unless one happened within the cooldown.
 * @returns true when a reload may go ahead
 */
function claimReload() {
    try {
        const lastReloadAt = Number(sessionStorage.getItem(PROXY_RELOAD_AT_KEY) ?? 0);
        const elapsed = Date.now() - lastReloadAt;
        // A future timestamp means the clock moved back.
        if (elapsed >= 0 && elapsed < PROXY_RELOAD_COOLDOWN_MS)
            return false;
        sessionStorage.setItem(PROXY_RELOAD_AT_KEY, String(Date.now()));
        return true;
    }
    catch {
        // Without storage nothing stops a reload loop.
        return false;
    }
}
/**
 * Reloads past the service worker so the proxy can show its login, or gives up within the cooldown.
 * @param options - how to report giving up
 * @returns never resolves when reloading; rejects when giving up
 */
export async function recoverFromProxyRedirect(options = {}) {
    if (!claimReload()) {
        throw options.createGiveUpError?.() ?? new Error("Sign-in required - reload the page");
    }
    return clearServiceWorkerAndReload();
}
//# sourceMappingURL=redirect.js.map