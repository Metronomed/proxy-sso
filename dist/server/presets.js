/**
 * @file Config presets for known auth proxies
 */
/** A single DNS label. */
const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;
/** A bare hostname, optionally with a port. */
const HOSTNAME = /^[a-z0-9.-]+(?::\d+)?$/i;
/**
 * Builds the config for Cloudflare Access.
 * @param options - team name and AUD tag
 * @returns the SSO config
 */
export function cloudflareAccess(options) {
    if (!DNS_LABEL.test(options.team)) {
        throw new Error(`cloudflareAccess: team must be the bare team name, got "${options.team}"`);
    }
    if (!options.audience)
        throw new Error("cloudflareAccess: audience is required");
    const teamDomain = `https://${options.team}.cloudflareaccess.com`;
    return {
        header: "cf-access-jwt-assertion",
        issuer: teamDomain,
        audience: options.audience,
        jwksUrl: `${teamDomain}/cdn-cgi/access/certs`,
        logoutUrl: "/cdn-cgi/access/logout",
    };
}
/**
 * Builds the config for a Pomerium route using the default `hostOnly` issuer.
 * @param options - the route's host
 * @returns the SSO config
 */
export function pomerium(options) {
    if (!HOSTNAME.test(options.host)) {
        throw new Error(`pomerium: host must be a bare hostname, got "${options.host}"`);
    }
    return {
        header: "x-pomerium-jwt-assertion",
        issuer: options.host,
        audience: options.host,
        jwksUrl: `https://${options.host}/.well-known/pomerium/jwks.json`,
        logoutUrl: "/.pomerium/sign_out",
    };
}
//# sourceMappingURL=presets.js.map