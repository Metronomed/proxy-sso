/**
 * @file Tests for redirect detection and reload recovery
 * @vitest-environment jsdom
 */

import { isProxyRedirect, recoverFromProxyRedirect } from "./redirect.js";
import { PROXY_NAVIGATE_FALLBACK_DENYLIST } from "./service-worker.js";

/** Fields of a Response that redirect detection reads. */
interface IResponseFields {
  /** Response type - "opaqueredirect" for unfollowed redirects. */
  type?: ResponseType;
  /** Whether fetch followed a redirect. */
  redirected?: boolean;
}

/**
 * Builds a minimal Response stand-in.
 * @param fields - type and redirected flag
 * @returns an object shaped like a Response for these checks
 */
function fakeResponse(fields: IResponseFields): Response {
  return { type: fields.type ?? "basic", redirected: fields.redirected ?? false } as Response;
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("isProxyRedirect", () => {
  it("detects an unfollowed (manual) redirect", () => {
    expect(isProxyRedirect(fakeResponse({ type: "opaqueredirect" }))).toBe(true);
  });

  it("detects a followed redirect", () => {
    expect(isProxyRedirect(fakeResponse({ redirected: true }))).toBe(true);
  });

  it("ignores a normal response", () => {
    expect(isProxyRedirect(fakeResponse({}))).toBe(false);
  });
});

describe("recoverFromProxyRedirect", () => {
  it("reloads the page", async () => {
    const reloadMock = vi.fn();
    vi.stubGlobal("location", { reload: reloadMock });

    void recoverFromProxyRedirect();
    await vi.waitFor(() => expect(reloadMock).toHaveBeenCalledOnce());
  });

  it("gives up with the app's error instead of reloading again within the cooldown", async () => {
    const reloadMock = vi.fn();
    vi.stubGlobal("location", { reload: reloadMock });

    void recoverFromProxyRedirect();
    await vi.waitFor(() => expect(reloadMock).toHaveBeenCalledOnce());

    const giveUpError = new Error("app error");
    await expect(recoverFromProxyRedirect({ createGiveUpError: () => giveUpError })).rejects.toBe(
      giveUpError,
    );
    expect(reloadMock).toHaveBeenCalledOnce();
  });

  it("falls back to a generic error when the app supplies none", async () => {
    vi.stubGlobal("location", { reload: vi.fn() });
    void recoverFromProxyRedirect();
    await expect(recoverFromProxyRedirect()).rejects.toThrow("Sign-in required");
  });

  it("still reloads when the browser refuses service worker and cache access", async () => {
    const reloadMock = vi.fn();
    vi.stubGlobal("location", { reload: reloadMock });
    const refuse = () =>
      Promise.reject(new DOMException("The operation is insecure", "SecurityError"));
    vi.stubGlobal("navigator", { serviceWorker: { getRegistrations: refuse } });
    vi.stubGlobal("caches", { keys: refuse });

    void recoverFromProxyRedirect();
    await vi.waitFor(() => expect(reloadMock).toHaveBeenCalledOnce());
  });

  it("gives up with the app's error when sessionStorage is unavailable", async () => {
    const reloadMock = vi.fn();
    vi.stubGlobal("location", { reload: reloadMock });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Access is denied", "SecurityError");
    });

    const giveUpError = new Error("app error");
    await expect(recoverFromProxyRedirect({ createGiveUpError: () => giveUpError })).rejects.toBe(
      giveUpError,
    );
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it("gives up when the reload can't be recorded", async () => {
    const reloadMock = vi.fn();
    vi.stubGlobal("location", { reload: reloadMock });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    await expect(recoverFromProxyRedirect()).rejects.toThrow("Sign-in required");
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it("treats a reload timestamp in the future as stale", async () => {
    const reloadMock = vi.fn();
    vi.stubGlobal("location", { reload: reloadMock });
    sessionStorage.setItem("proxy-sso:reload-at", String(Date.now() + 3_600_000));

    void recoverFromProxyRedirect();
    await vi.waitFor(() => expect(reloadMock).toHaveBeenCalledOnce());
  });
});

describe("PROXY_NAVIGATE_FALLBACK_DENYLIST", () => {
  it("covers Cloudflare Access and Pomerium paths but not app routes", () => {
    const denied = (path: string) => PROXY_NAVIGATE_FALLBACK_DENYLIST.some((re) => re.test(path));
    expect(denied("/cdn-cgi/access/logout")).toBe(true);
    expect(denied("/.pomerium/sign_out")).toBe(true);
    expect(denied("/recipes")).toBe(false);
  });
});
