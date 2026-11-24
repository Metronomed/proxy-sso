/**
 * @file Verifies the identity JWT an auth proxy forwards
 */

import { createRemoteJWKSet, jwtVerify } from "jose";

import type { IProxyAuthConfig } from "./config.js";

/** Asymmetric algorithms only. */
const ALLOWED_ALGORITHMS = ["RS256", "RS384", "RS512", "PS256", "ES256", "ES384", "EdDSA"];

/** Who a verified proxy JWT identifies. */
export interface IProxyIdentity {
  /** The proxy's stable user ID. */
  sub: string;
  /** Lowercased email claim, if any. */
  email: string | undefined;
}

/** Reads a request header by name, e.g. `(name) => req.get(name)`. */
export type HeaderReader = (name: string) => string | null | undefined;

/** Remote key set fetcher returned by jose. */
type ProxyKeySet = ReturnType<typeof createRemoteJWKSet>;

/** Key sets by URL, so each is fetched and cached once. */
const keySets = new Map<string, ProxyKeySet>();

/** Whether the missing-header warning was logged. */
let warnedMissingHeader = false;

/**
 * Warns once per process about a missing JWT header, usually a bypassed path.
 * @param header - the expected header
 */
function warnMissingHeaderOnce(header: string): void {
  if (warnedMissingHeader) return;
  warnedMissingHeader = true;
  console.warn(`[proxy-sso] Request had no ${header} header - is this path bypassed by the proxy?`);
}

/**
 * Whether every required setting is a non-empty string; jose skips undefined checks.
 * @param config - SSO config to check
 * @returns true when header, issuer, audience, and JWKS URL are set
 */
function isCompleteConfig(config: IProxyAuthConfig): boolean {
  const required = [config.header, config.issuer, config.audience, config.jwksUrl];
  return required.every((value) => typeof value === "string" && value !== "");
}

/**
 * Gets the cached key set for a URL.
 * @param jwksUrl - URL of the signing keys
 * @returns the key set
 */
function getKeys(jwksUrl: string): ProxyKeySet {
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
export async function verifyProxyIdentity(
  config: IProxyAuthConfig | undefined,
  readHeader: HeaderReader,
): Promise<IProxyIdentity | undefined> {
  if (!config) return undefined;
  if (!isCompleteConfig(config)) {
    console.error(
      "[proxy-sso] Config is missing header, issuer, audience, or jwksUrl - SSO refused",
    );
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
    if (typeof payload.sub !== "string" || !payload.sub) return undefined;
    const email =
      typeof payload.email === "string" && payload.email
        ? payload.email.toLowerCase().trim()
        : undefined;
    return { sub: payload.sub, email };
  } catch (err) {
    console.error("[proxy-sso] JWT verification failed:", err instanceof Error ? err.message : err);
    return undefined;
  }
}
