/**
 * @file Server entry point
 */
export { findProxyAccount, linkProxyAccount, unlinkProxyAccount, type Awaitable, type IProxyAccount, type IProxyAccountStore, } from "./accounts.js";
export { getProxyLogoutUrl, logProxyAuthStatus, type IProxyAuthConfig, type IProxyAuthLogger, } from "./config.js";
export { cloudflareAccess, pomerium, type ICloudflareAccessOptions, type IPomeriumOptions, } from "./presets.js";
export { verifyProxyIdentity, type HeaderReader, type IProxyIdentity } from "./verify.js";
//# sourceMappingURL=index.d.ts.map