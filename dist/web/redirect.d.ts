/**
 * @file Detects a proxy login redirect and reloads past the service worker
 */
/** Fetch options that surface a proxy redirect instead of a CORS error. */
export declare const PROXY_AWARE_FETCH_INIT: {
    readonly redirect: "manual";
};
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
export declare function isProxyRedirect(res: Response): boolean;
/**
 * Unregisters service workers and clears caches where allowed, then reloads.
 * @returns never resolves
 */
export declare function clearServiceWorkerAndReload(): Promise<never>;
/**
 * Reloads past the service worker so the proxy can show its login, or gives up within the cooldown.
 * @param options - how to report giving up
 * @returns never resolves when reloading; rejects when giving up
 */
export declare function recoverFromProxyRedirect(options?: IRecoverOptions): Promise<never>;
//# sourceMappingURL=redirect.d.ts.map