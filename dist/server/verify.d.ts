/**
 * @file Verifies the identity JWT an auth proxy forwards
 */
import type { IProxyAuthConfig } from "./config.js";
/** Who a verified proxy JWT identifies. */
export interface IProxyIdentity {
    /** The proxy's stable user ID. */
    sub: string;
    /** Lowercased email claim, if any. */
    email: string | undefined;
}
/** Reads a request header by name, e.g. `(name) => req.get(name)`. */
export type HeaderReader = (name: string) => string | null | undefined;
/**
 * Verifies the request's proxy JWT and returns who it identifies.
 * @param config - SSO config, or undefined when SSO is off
 * @param readHeader - reads a header from the request
 * @returns the identity, or undefined when the JWT is missing or invalid
 */
export declare function verifyProxyIdentity(config: IProxyAuthConfig | undefined, readHeader: HeaderReader): Promise<IProxyIdentity | undefined>;
//# sourceMappingURL=verify.d.ts.map