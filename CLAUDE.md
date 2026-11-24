# proxy-sso

Auth-proxy SSO code shared by PlateCraft, FloorCraft, and CuteBooks, so it lives in one place instead of being copied. Deliberately narrow. Apps consume it as a git dependency pinned to a tag.

## Layout

- `src/server/` - JWT verification (`verify.ts`), account matching, linking, and unlinking rules (`accounts.ts`), config shape and status logging (`config.ts`), proxy presets (`presets.ts`). Framework-agnostic: headers come in through a `HeaderReader`, the database through an `IProxyAccountStore` adapter each app implements.
- `src/web/` - browser helpers: proxy redirect detection and reload recovery, the service worker navigation denylist. No top-level DOM access, so `vite.config.ts` can import it.

## Conventions

- ESM, `moduleResolution: nodenext` - relative imports use `.js` extensions.
- Every `.ts` file starts with a one-line JSDoc `@file` header (copyright lives in `LICENSE`); every function, interface, and type has JSDoc; interfaces are `I`-prefixed with documented properties.
- No framework or ORM dependencies. `jose` is the only runtime dependency.
- The account rules are security-critical (they stop one user capturing another's proxy identity). Any change needs a test in `accounts.test.ts`.

## Validation

Run `bun run validate` (lint, format check, typecheck, build, test) after changes.

## Releasing

Releases run in the Release workflow (`gh workflow run release.yml -f bump=patch|minor|major`), which needs `## [Unreleased]` entries in `CHANGELOG.md`. `scripts/release.js` commits the version bump on main and tags a separate commit holding only `dist/`, `package.json`, `LICENSE`, and `README.md` - `dist/` never lands on main.
