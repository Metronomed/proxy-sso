/**
 * @file Verifies the identity JWT an auth proxy forwards
 */
import { createRemoteJWKSet, jwtVerify } from "jose";
/** Asymmetric algorithms only. */
const ALLOWED_ALGORITHMS = ["RS256", "RS384", "RS512", "PS256", "ES256", "ES384", "EdDSA"];
/** Key sets by URL, so each is fetched and cached once. */
const keySets = new Map();
/** Whether the missing-header warning was logged. */
let warnedMissingHeader = false;
/**
 * Warns once per process about a missing JWT header, usually a bypassed path.
 * @param header - the expected header
 */
function warnMissingHeaderOnce(header) {
    if (warnedMissingHeader)
        return;
    warnedMissingHeader = true;
    console.warn(`[proxy-sso] Request had no ${header} header - is this path bypassed by the proxy?`);
}
/**
 * Whether every required setting is a non-empty string; jose skips undefined checks.
 * @param config - SSO config to check
 * @returns true when header, issuer, audience, and JWKS URL are set
 */
function isCompleteConfig(config) {
    const required = [config.header, config.issuer, config.audience, config.jwksUrl];
    return required.every((value) => typeof value === "string" && value !== "");
}
/**
 * Gets the cached key set for a URL.
 * @param jwksUrl - URL of the signing keys
 * @returns the key set
 */
function getKeys(jwksUrl) {
    let keys = keySets.get(jwksUrl);
    if (!keys) {
        keys = createRemoteJWKSet(new URL(jwksUrl));
        keySets.set(jwksUrl, keys);
    }
    return keys;
}
/**
 * Verifies the request's proxy JWT and returns who it identifies.
 * @param config - SSO config, or undefined when SSO is off
 * @param readHeader - reads a header from the request
 * @returns the identity, or undefined when the JWT is missing or invalid
 */
export async function verifyProxyIdentity(config, readHeader) {
    if (!config)
        return undefined;
    if (!isCompleteConfig(config)) {
        console.error("[proxy-sso] Config is missing header, issuer, audience, or jwksUrl - SSO refused");
        return undefined;
    }
    const token = readHeader(config.header);
    if (!token) {
        warnMissingHeaderOnce(config.header);
        return undefined;
    }
    try {
        const { payload } = await jwtVerify(token, getKeys(config.jwksUrl), {
            issuer: config.issuer,
            audience: config.audience,
            algorithms: ALLOWED_ALGORITHMS,
            requiredClaims: ["exp"],
        });
        if (typeof payload.sub !== "string" || !payload.sub)
            return undefined;
        const email = typeof payload.email === "string" && payload.email
            ? payload.email.toLowerCase().trim()
            : undefined;
        return { sub: payload.sub, email };
    }
    catch (err) {
        console.error("[proxy-sso] JWT verification failed:", err instanceof Error ? err.message : err);
        return undefined;
    }
}
//# sourceMappingURL=verify.js.map