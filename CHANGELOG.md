# Changelog

All notable changes to this package are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-11-23

### Added

- Proxy JWT verification that checks signature, issuer, audience, and expiry, and refuses an incomplete config.
- `cloudflareAccess()` and `pomerium()` config presets.
- Account matching, linking on password login, and unlinking.
- Web helpers to detect a proxy login redirect, reload past the service worker, and keep proxy paths out of the PWA fallback.
