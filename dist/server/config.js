/**
 * @file SSO config shape, logout URL, and startup logging
 */
/**
 * Gets the proxy logout URL.
 * @param config - SSO config, or undefined when SSO is off
 * @returns the logout URL, or null when SSO is off or no URL is set
 */
export function getProxyLogoutUrl(config) {
    return config?.logoutUrl ?? null;
}
/**
 * Logs at startup whether SSO is on, and warns if there's no logout URL.
 * @param config - SSO config, or undefined when SSO is off
 * @param logger - where to write the messages
 */
export function logProxyAuthStatus(config, logger) {
    if (!config)
        return;
    logger.info("Auth proxy SSO enabled");
    if (!config.logoutUrl) {
        logger.warn("No proxy logout URL is set - signing out lasts only until the next page load");
    }
}
//# sourceMappingURL=config.js.map