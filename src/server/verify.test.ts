/**
 * @file Tests for JWT verification with real signed tokens
 */

import type { CryptoKey, JWK, JWTVerifyGetKey } from "jose";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";

import type { IProxyAuthConfig } from "./config.js";
import { cloudflareAccess, pomerium } from "./presets.js";
import { verifyProxyIdentity, type HeaderReader } from "./verify.js";

/** Local keys the mocked remote key set uses. */
let localKeys: JWTVerifyGetKey | null = null;
const createRemoteJWKSetMock = vi.fn();

vi.mock("jose", async (importOriginal) => {
  const actual = await importOriginal<typeof import("jose")>();
  return {
    ...actual,
    createRemoteJWKSet: (...args: unknown[]) => {
      createRemoteJWKSetMock(...args);
      return (...keyArgs: Parameters<JWTVerifyGetKey>) => localKeys!(...keyArgs);
    },
  };
});

const HEADER = "cf-access-jwt-assertion";
const ISSUER = "https://team.cloudflareaccess.com";
const AUDIENCE = "aud-tag-123";
const JWKS_URL = `${ISSUER}/cdn-cgi/access/certs`;

/** Config for the test proxy; mixed-case header on purpose. */
const config: IProxyAuthConfig = {
  header: "Cf-Access-Jwt-Assertion",
  issuer: ISSUER,
  audience: AUDIENCE,
  jwksUrl: JWKS_URL,
  logoutUrl: null,
};

/** Fields a test may override when minting a token. */
interface ITokenOptions {
  /** Private key to sign with. */
  key?: CryptoKey;
  /** `iss` claim. */
  issuer?: string;
  /** `aud` claim. */
  audience?: string;
  /** Extra claims merged into the payload. */
  claims?: Record<string, unknown>;
  /** `sub` claim; null omits it. */
  subject?: string | null;
  /** `exp` claim, as accepted by jose's setExpirationTime; null omits it. */
  expiresAt?: string | number | null;
}

let signingKey: CryptoKey;
let foreignKey: CryptoKey;
/** ES256 key standing in for Pomerium's signing key. */
let pomeriumKey: CryptoKey;

/**
 * Signs a JWT, valid for the test config by default.
 * @param options - claims or key to override
 * @returns the compact serialized JWT
 */
async function mintToken(options: ITokenOptions = {}): Promise<string> {
  const jwt = new SignJWT({ email: "Alice@Example.com", ...options.claims })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? AUDIENCE);
  if (options.subject !== null) jwt.setSubject(options.subject ?? "user-sub");
  if (options.expiresAt !== null) jwt.setExpirationTime(options.expiresAt ?? "5m");
  return jwt.setIssuedAt().sign(options.key ?? signingKey);
}

/**
 * Builds a case-insensitive reader that only knows one header.
 * @param token - JWT to return
 * @param header - lowercased header name
 * @returns the header reader
 */
function headersWith(token: string, header = HEADER): HeaderReader {
  return (name) => (name.toLowerCase() === header ? token : undefined);
}

/**
 * Signs a Pomerium-shaped token (ES256, host as audience).
 * @param issuer - `iss` claim
 * @param host - route host, used as `aud`
 * @returns the compact serialized JWT
 */
async function mintPomeriumToken(issuer: string, host: string): Promise<string> {
  return new SignJWT({ email: "alice@example.com" })
    .setProtectedHeader({ alg: "ES256", kid: "pomerium-key" })
    .setIssuer(issuer)
    .setAudience(host)
    .setSubject("pomerium-user")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(pomeriumKey);
}

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  signingKey = pair.privateKey;
  foreignKey = (await generateKeyPair("RS256")).privateKey;
  const publicJwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: "test-key", alg: "RS256" };
  const pomeriumPair = await generateKeyPair("ES256");
  pomeriumKey = pomeriumPair.privateKey;
  const pomeriumJwk: JWK = {
    ...(await exportJWK(pomeriumPair.publicKey)),
    kid: "pomerium-key",
    alg: "ES256",
  };
  localKeys = createLocalJWKSet({ keys: [publicJwk, pomeriumJwk] });
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("verifyProxyIdentity", () => {
  it("returns the subject and lowercased email for a valid token", async () => {
    expect(await verifyProxyIdentity(config, headersWith(await mintToken()))).toEqual({
      sub: "user-sub",
      email: "alice@example.com",
    });
    expect(createRemoteJWKSetMock).toHaveBeenCalledWith(new URL(JWKS_URL));
  });

  it("rejects a token for a different audience", async () => {
    const token = await mintToken({ audience: "another-app" });
    expect(await verifyProxyIdentity(config, headersWith(token))).toBeUndefined();
  });

  it("rejects a token from a different issuer", async () => {
    const token = await mintToken({ issuer: "https://evil.cloudflareaccess.com" });
    expect(await verifyProxyIdentity(config, headersWith(token))).toBeUndefined();
  });

  it("rejects an expired token", async () => {
    const token = await mintToken({ expiresAt: Math.floor(Date.now() / 1000) - 600 });
    expect(await verifyProxyIdentity(config, headersWith(token))).toBeUndefined();
  });

  it("rejects a token without an expiry", async () => {
    const token = await mintToken({ expiresAt: null });
    expect(await verifyProxyIdentity(config, headersWith(token))).toBeUndefined();
  });

  it("rejects a token signed by a key outside the JWKS", async () => {
    const token = await mintToken({ key: foreignKey });
    expect(await verifyProxyIdentity(config, headersWith(token))).toBeUndefined();
  });

  it("rejects an unsigned token", async () => {
    const encode = (part: object) => Buffer.from(JSON.stringify(part)).toString("base64url");
    const header = encode({ alg: "none", kid: "test-key" });
    const payload = encode({ sub: "user-sub", iss: ISSUER, aud: AUDIENCE });
    expect(await verifyProxyIdentity(config, headersWith(`${header}.${payload}.`))).toBeUndefined();
  });

  it("returns the subject without an email when the claim is missing", async () => {
    const token = await mintToken({ claims: { email: undefined } });
    expect(await verifyProxyIdentity(config, headersWith(token))).toEqual({
      sub: "user-sub",
      email: undefined,
    });
  });

  it("drops a non-string email claim", async () => {
    const token = await mintToken({ claims: { email: ["alice@example.com"] } });
    expect((await verifyProxyIdentity(config, headersWith(token)))?.email).toBeUndefined();
  });

  it("rejects a token without a subject", async () => {
    const token = await mintToken({ subject: null });
    expect(await verifyProxyIdentity(config, headersWith(token))).toBeUndefined();
  });

  it("returns undefined and warns once when the header is missing", async () => {
    const warnSpy = vi.mocked(console.warn);
    expect(await verifyProxyIdentity(config, () => undefined)).toBeUndefined();
    expect(await verifyProxyIdentity(config, () => null)).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it("refuses every token when a config value is missing at runtime", async () => {
    const env: Record<string, string | undefined> = {};
    const incomplete: IProxyAuthConfig = { ...config, audience: env.UNSET_AUDIENCE! };
    expect(await verifyProxyIdentity(incomplete, headersWith(await mintToken()))).toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("SSO refused"));
  });

  it("ignores the header entirely when SSO is off", async () => {
    const readHeader = vi.fn(headersWith(await mintToken()));
    expect(await verifyProxyIdentity(undefined, readHeader)).toBeUndefined();
    expect(readHeader).not.toHaveBeenCalled();
  });
});

describe("presets with proxy-shaped tokens", () => {
  it("verifies a Cloudflare Access token through cloudflareAccess()", async () => {
    const preset = cloudflareAccess({ team: "team", audience: AUDIENCE });
    expect((await verifyProxyIdentity(preset, headersWith(await mintToken())))?.sub).toBe(
      "user-sub",
    );
  });

  it("verifies a Pomerium token whose issuer is the bare route host", async () => {
    const preset = pomerium({ host: "app.example.com" });
    const token = await mintPomeriumToken("app.example.com", "app.example.com");
    expect(await verifyProxyIdentity(preset, headersWith(token, preset.header))).toEqual({
      sub: "pomerium-user",
      email: "alice@example.com",
    });
  });

  it("rejects a Pomerium token for another route", async () => {
    const preset = pomerium({ host: "app.example.com" });
    const token = await mintPomeriumToken("other.example.com", "other.example.com");
    expect(await verifyProxyIdentity(preset, headersWith(token, preset.header))).toBeUndefined();
  });

  it("needs an issuer override when Pomerium uses the uri issuer format", async () => {
    const preset = pomerium({ host: "app.example.com" });
    const token = await mintPomeriumToken("https://app.example.com/", "app.example.com");
    const read = headersWith(token, preset.header);
    expect(await verifyProxyIdentity(preset, read)).toBeUndefined();
    const overridden = { ...preset, issuer: "https://app.example.com/" };
    expect((await verifyProxyIdentity(overridden, read))?.sub).toBe("pomerium-user");
  });
});
