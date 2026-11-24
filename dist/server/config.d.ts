/**
 * @file SSO config shape, logout URL, and startup logging
 */
/** What to verify proxy JWTs against. Undefined means SSO is off. */
export interface IProxyAuthConfig {
    /** Header carrying the JWT. */
    header: string;
    /** Expected `iss` claim. */
    issuer: string;
    /** Expected `aud` claim. */
    audience: string;
    /** URL of the proxy's signing keys. */
    jwksUrl: string;
    /** Where logout sends the browser to end the proxy session, or null. */
    logoutUrl: string | null;
}
/** Minimal logger; `console` fits. */
export interface IProxyAuthLogger {
    /** Logs an informational message. */
    info: (message: string) => void;
    /** Logs a warning. */
    warn: (message: string) => void;
}
/**
 * Gets the proxy logout URL.
 * @param config - SSO config, or undefined when SSO is off
 * @returns the logout URL, or null when SSO is off or no URL is set
 */
export declare function getProxyLogoutUrl(config: IProxyAuthConfig | undefined): string | null;
/**
 * Logs at startup whether SSO is on, and warns if there's no logout URL.
 * @param config - SSO config, or undefined when SSO is off
 * @param logger - where to write the messages
 */
export declare function logProxyAuthStatus(config: IProxyAuthConfig | undefined, logger: IProxyAuthLogger): void;
//# sourceMappingURL=config.d.ts.map