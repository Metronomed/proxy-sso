/**
 * @file Config presets for known auth proxies
 */
import type { IProxyAuthConfig } from "./config.js";
/** Options for {@link cloudflareAccess}. */
export interface ICloudflareAccessOptions {
    /** The `<team>` in `<team>.cloudflareaccess.com`. */
    team: string;
    /** AUD tag of the Access application. */
    audience: string;
}
/** Options for {@link pomerium}. */
export interface IPomeriumOptions {
    /** The route's host, e.g. `app.example.com`. */
    host: string;
}
/**
 * Builds the config for Cloudflare Access.
 * @param options - team name and AUD tag
 * @returns the SSO config
 */
export declare function cloudflareAccess(options: ICloudflareAccessOptions): IProxyAuthConfig;
/**
 * Builds the config for a Pomerium route using the default `hostOnly` issuer.
 * @param options - the route's host
 * @returns the SSO config
 */
export declare function pomerium(options: IPomeriumOptions): IProxyAuthConfig;
//# sourceMappingURL=presets.d.ts.map