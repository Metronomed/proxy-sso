/**
 * @file Proxy paths a PWA service worker must leave to the network
 */
/** Cloudflare Access and Pomerium paths, for workbox `navigateFallbackDenylist`. */
export const PROXY_NAVIGATE_FALLBACK_DENYLIST = [
    /^\/cdn-cgi\//,
    /^\/\.pomerium\//,
];
//# sourceMappingURL=service-worker.js.map