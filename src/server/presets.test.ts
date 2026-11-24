/**
 * @file Tests for the config presets
 */

import { cloudflareAccess, pomerium } from "./presets.js";

describe("cloudflareAccess", () => {
  it("builds the team-domain issuer, certs URL, and logout URL", () => {
    expect(cloudflareAccess({ team: "myteam", audience: "aud-123" })).toEqual({
      header: "cf-access-jwt-assertion",
      issuer: "https://myteam.cloudflareaccess.com",
      audience: "aud-123",
      jwksUrl: "https://myteam.cloudflareaccess.com/cdn-cgi/access/certs",
      logoutUrl: "/cdn-cgi/access/logout",
    });
  });

  it("rejects a full domain or URL in place of the team name", () => {
    expect(() => cloudflareAccess({ team: "myteam.cloudflareaccess.com", audience: "a" })).toThrow(
      "bare team name",
    );
    expect(() => cloudflareAccess({ team: "https://myteam", audience: "a" })).toThrow();
  });

  it("rejects a missing audience", () => {
    expect(() => cloudflareAccess({ team: "myteam", audience: "" })).toThrow("audience");
  });
});

describe("pomerium", () => {
  it("uses the route host as issuer and audience", () => {
    expect(pomerium({ host: "app.example.com" })).toEqual({
      header: "x-pomerium-jwt-assertion",
      issuer: "app.example.com",
      audience: "app.example.com",
      jwksUrl: "https://app.example.com/.well-known/pomerium/jwks.json",
      logoutUrl: "/.pomerium/sign_out",
    });
  });

  it("accepts a host with a port", () => {
    expect(pomerium({ host: "app.example.com:8443" }).jwksUrl).toBe(
      "https://app.example.com:8443/.well-known/pomerium/jwks.json",
    );
  });

  it("rejects a URL in place of a host", () => {
    expect(() => pomerium({ host: "https://app.example.com" })).toThrow("bare hostname");
    expect(() => pomerium({ host: "app.example.com/path" })).toThrow();
    expect(() => pomerium({ host: "" })).toThrow();
  });
});
