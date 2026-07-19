# Architecture

## Phase 1 shape

Expo Router owns a guarded authentication stack and an authenticated tab shell with exactly Today's Route, Sync, and Account. `AuthProvider` keeps the access credential in memory, stores only the device identifier and refresh credential with SecureStore, rotates sessions through the generated backend contract, and clears invalid or logged-out sessions. OTP challenges stay in provider memory rather than route parameters.

`AppProviders` owns the TanStack Query client and authentication provider. Authenticated state comes from `GET /v1/auth/me`; only an active delivery-agent membership establishes an assignment. Wrong-role sessions receive a permission state. Missing, inactive, and suspended assignments share security-safe access-unavailable copy because phone authentication intentionally does not disclose inactive membership state. Route and Sync use NetInfo for connectivity presentation. The backend remains authoritative, and the committed OpenAPI artifact records its backend commit and SHA-256 provenance.

`EXPO_PUBLIC_API_BASE_URL` is the sole public runtime setting. It accepts only an absolute, credential-free HTTP(S) origin.

## Deliberate deferrals

Phase 1 has no SQLite database, cached route projection, writable delivery flow, durable action queue, idempotency key, GPS, notification, or background synchronization. The Sync screen reports that no delivery actions are pending without claiming an offline queue exists.

The approved offline phase will add SQLite and an explicit action state machine. It must preserve unsynchronized actions, reuse each action's idempotency key for retries, expose conflicts without silent overwrite or deletion, and never depend on opportunistic background execution for correctness.

## Repository lifecycle

This repository owns its Git history, Dockerfile, Compose service, CI workflow, dependencies, tests, and releases. Docker provides Node.js 24 for local development and checks; a mobile runtime renders the app.
