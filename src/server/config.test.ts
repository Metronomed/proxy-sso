/**
 * @file Tests for the logout URL and startup logging
 */

import { getProxyLogoutUrl, logProxyAuthStatus, type IProxyAuthConfig } from "./config.js";

/** Config with every required setting present and no logout URL. */
const config: IProxyAuthConfig = {
  header: "cf-access-jwt-assertion",
  issuer: "https://team.cloudflareaccess.com",
  audience: "aud-tag-123",
  jwksUrl: "https://team.cloudflareaccess.com/cdn-cgi/access/certs",
  logoutUrl: null,
};

describe("getProxyLogoutUrl", () => {
  it("returns the configured URL", () => {
    expect(getProxyLogoutUrl({ ...config, logoutUrl: "/logout" })).toBe("/logout");
  });

  it("returns null when SSO is off", () => {
    expect(getProxyLogoutUrl(undefined)).toBeNull();
  });

  it("returns null when no URL is configured", () => {
    expect(getProxyLogoutUrl(config)).toBeNull();
  });
});

describe("logProxyAuthStatus", () => {
  it("warns when SSO is enabled without a logout URL", () => {
    const logger = { info: vi.fn(), warn: vi.fn() };
    logProxyAuthStatus(config, logger);
    expect(logger.info).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("logout URL"));
  });

  it("stays quiet about logout when a URL is configured", () => {
    const logger = { info: vi.fn(), warn: vi.fn() };
    logProxyAuthStatus({ ...config, logoutUrl: "/logout" }, logger);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("logs nothing when SSO is off", () => {
    const logger = { info: vi.fn(), warn: vi.fn() };
    logProxyAuthStatus(undefined, logger);
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
