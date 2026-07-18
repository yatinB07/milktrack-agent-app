# Architecture

## Phase 0 shape

Expo Router owns a root authentication stack and an authenticated tab shell with exactly Today's Route, Sync, and Account. The root redirects to phone entry until a later phase provides real session state. Components and design tokens are local to this repository; no source is linked across MilkTrack repositories.

`AppProviders` owns the TanStack Query client. Route and Sync use NetInfo plus the generated `openapi-fetch` client to query backend `GET /v1/health`. The backend remains authoritative, and the committed OpenAPI artifact records its backend commit and SHA-256 provenance.

`EXPO_PUBLIC_API_BASE_URL` is the sole public runtime setting. It accepts only an absolute, credential-free HTTP(S) origin.

## Deliberate deferrals

This foundation has no SQLite database, cached route projection, writable delivery flow, durable action queue, idempotency key, GPS, notification, or background synchronization. The Sync screen therefore states that no offline actions are stored.

The approved offline phase will add SQLite and an explicit action state machine. It must preserve unsynchronized actions, reuse each action's idempotency key for retries, expose conflicts without silent overwrite or deletion, and never depend on opportunistic background execution for correctness.

## Repository lifecycle

This repository owns its Git history, Dockerfile, Compose service, CI workflow, dependencies, tests, and releases. Docker provides Node.js 24 for local development and checks; a mobile runtime renders the app.
