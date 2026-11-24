# proxy-sso

A few self-hosted apps each needed the same thing: when they sit behind Cloudflare Access or Pomerium, sign the user in from the proxy's login instead of asking again. The code kept getting copied between them, so it lives here now and a fix only happens once.

It covers three pieces; each app keeps its own routes, sessions, migration, and UI.

- **Verification** - checks the proxy's identity JWT. Plain identity headers are never trusted.
- **Account rules** - match an identity to an account, and link one on password login when the emails differ.
- **Browser recovery** - notice the proxy redirecting an API call to its login page, and reload past the service worker.

## Install

```sh
bun add github:Metronomed/proxy-sso#v1.0.0
```

## Server

Build a config with a preset from your app's own env vars. `undefined` turns SSO off.

```ts
import { cloudflareAccess } from "@metronomed/proxy-sso/server";

const team = process.env.CF_ACCESS_TEAM;
export const proxyConfig = team
  ? cloudflareAccess({ team, audience: process.env.CF_ACCESS_AUD ?? "" })
  : undefined;
```

Presets throw on a missing or malformed value, so a half-set env fails at startup.

| Preset                                 | Fills in                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------- |
| `cloudflareAccess({ team, audience })` | header, `https://<team>.cloudflareaccess.com` issuer and keys, logout URL |
| `pomerium({ host })`                   | header, the route's bare host as issuer and audience, keys, sign-out URL  |

Spread a preset to override a field, e.g. `{ ...pomerium({ host }), issuer: "https://app.example.com/" }` for Pomerium's `uri` issuer format. Other proxies that forward an asymmetrically signed JWT take a literal config:

```ts
import type { IProxyAuthConfig } from "@metronomed/proxy-sso/server";

const otherProxyConfig: IProxyAuthConfig = {
  header: "x-example-jwt-assertion",
  issuer: "https://auth.example.com",
  audience: "my-app",
  jwksUrl: "https://auth.example.com/.well-known/jwks.json",
  logoutUrl: null,
};
```

Add a unique, nullable `proxy_sub` column to the users table and implement the store. This example uses Drizzle with a synchronous SQLite driver; with an async one, `await` each query.

```ts
import type { IProxyAccount, IProxyAccountStore } from "@metronomed/proxy-sso/server";
import { and, eq, isNotNull, isNull } from "drizzle-orm";

import { db } from "./db.js";
import { users } from "./schema.js";

type UserRow = typeof users.$inferSelect;
type UserAccount = UserRow & IProxyAccount;

const toAccount = (row: UserRow | undefined): UserAccount | undefined =>
  row && { ...row, isDeactivated: row.deletedAt !== null };

export const proxyAccounts: IProxyAccountStore<UserAccount> = {
  findBySub: (sub) => toAccount(db.select().from(users).where(eq(users.proxySub, sub)).get()),
  findByEmail: (email) => toAccount(db.select().from(users).where(eq(users.email, email)).get()),
  linkSubIfUnlinked: (id, sub) =>
    db
      .update(users)
      .set({ proxySub: sub })
      .where(and(eq(users.id, id), isNull(users.proxySub)))
      .returning({ id: users.id })
      .get() !== undefined,
  unlinkSub: (id) =>
    db
      .update(users)
      .set({ proxySub: null })
      .where(and(eq(users.id, id), isNotNull(users.proxySub)))
      .returning({ id: users.id })
      .get() !== undefined,
};
```

The store must:

- include deactivated accounts in lookups;
- store emails lowercased and unique across all accounts;
- keep `proxy_sub` unique. Two concurrent links of one identity hit that constraint, so `linkProxyAccount` can reject.

Then wire up the auth routes:

| Route                    | What to do                                                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| "Who am I" (on app load) | Without a session, `verifyProxyIdentity` then `findProxyAccount`; on a match, start a session. Skip during first-run setup. |
| Password login           | After the password checks out, `verifyProxyIdentity` then `linkProxyAccount`.                                               |
| Logout                   | Don't require a session. Respond with `{ redirectTo: getProxyLogoutUrl(proxyConfig) }`.                                     |
| Deactivate user          | Also call `unlinkProxyAccount`.                                                                                             |
| Unlink (optional, admin) | `unlinkProxyAccount`; the next password login links again.                                                                  |
| Startup                  | `logProxyAuthStatus(proxyConfig, console)`.                                                                                 |

`getSessionUser` and `startSession` below stand in for the app's session code.

Express:

```ts
app.get("/auth/me", async (req, res) => {
  const user = await getSessionUser(req);
  if (user) return res.json({ user });

  const identity = await verifyProxyIdentity(proxyConfig, (name) => req.get(name));
  const account = identity && (await findProxyAccount(proxyAccounts, identity));
  if (!account) return res.status(401).json({ error: "Not signed in" });

  startSession(res, account.id);
  return res.json({ user: account });
});
```

Hono:

```ts
app.get("/auth/me", async (c) => {
  const user = await getSessionUser(c);
  if (user) return c.json({ user });

  const identity = await verifyProxyIdentity(proxyConfig, (name) => c.req.header(name));
  const account = identity && (await findProxyAccount(proxyAccounts, identity));
  if (!account) return c.json({ error: "Not signed in" }, 401);

  startSession(c, account.id);
  return c.json({ user: account });
});
```

Password login:

```ts
const identity = await verifyProxyIdentity(proxyConfig, (name) => c.req.header(name));
if (identity) await linkProxyAccount(proxyAccounts, account.id, identity);
```

## How it decides who you are

- **The proxy policy is the gate.** Anyone it lets through who matches an account signs in without a password.
- **Only the signed JWT counts.** Signature, issuer, audience, and expiry are checked; plain headers are ignored because anything reaching the app directly can set them. Apps sharing one Access application share an audience.
- **Link first, then email.** A linked identity signs in as its account; otherwise the account with the same email, unless it's linked to someone else. Deactivated accounts never match, and nothing creates accounts.
- **Linking needs a password login,** never takes an identity another account has, and never replaces a link.
- **The first link trusts whoever is signed in to the proxy.** If Bob enters his password while Alice is signed in to the proxy, and her email matches no account, Alice gets linked to Bob's account. `unlinkProxyAccount` undoes it, and also resets a link after the proxy changes someone's ID.

## Web

```ts
import {
  isProxyRedirect,
  PROXY_AWARE_FETCH_INIT,
  recoverFromProxyRedirect,
} from "@metronomed/proxy-sso/web";

const res = await fetch(path, { ...PROXY_AWARE_FETCH_INIT, ...init });
if (isProxyRedirect(res)) {
  return recoverFromProxyRedirect({
    createGiveUpError: () => new ApiError(401, "Sign-in required"),
  });
}
```

On logout with a `redirectTo`: show the loading screen, clear local and offline state, then `window.location.assign(redirectTo)`.

Keep proxy paths out of the PWA's cached app shell in `vite.config.ts`:

```ts
import { PROXY_NAVIGATE_FALLBACK_DENYLIST } from "@metronomed/proxy-sso/web";

workbox: {
  navigateFallbackDenylist: [/^\/api/, /^\/auth/, ...PROXY_NAVIGATE_FALLBACK_DENYLIST],
},
```

## Proxy setup

- Allow only the people who may sign in: the proxy policy is the gate.
- Don't bypass or make public the path the app signs in on (e.g. `/auth`); those requests carry no JWT. Bypassing `/api` and `/health` is fine.
- Cloudflare Access: use the AUD tag of the Allow application.
- Pomerium: set `pass_identity_headers: true` on the route.
- The startup log should say `Auth proxy SSO enabled`. `[proxy-sso]` warnings mean a missing header (bypassed path), a rejected JWT (issuer or audience mismatch), or no matching account (link with a password login).

## Development

```sh
bun install
bun run validate   # lint, format check, typecheck, build, test
bun run release minor
```

`release` needs a clean `main` and `## [Unreleased]` changelog entries. It tags a detached commit containing `dist/`, since Bun doesn't build git dependencies. Push with `git push origin main vX.Y.Z`; CI checks the tag and publishes the GitHub Release.

## License

[MIT](LICENSE)
