# Architecture

## Current shape

Expo Router owns a guarded authentication stack and an authenticated tab shell with exactly Today's Route, Sync, and Account. `AuthProvider` keeps the access credential in memory, stores the refresh credential, device identifier, and last non-secret actor scope with SecureStore, and rotates sessions through the generated backend contract. OTP challenges remain in provider memory.

`AppProviders` owns TanStack Query, Expo SQLite, authentication, and the one synchronization provider. Standard access still requires an active delivery-agent membership. If access is revoked while an authorization-blocked action remains, the same phone can request an OTP for an opaque local `routeSyncId`. The backend may issue an `offline_recovery` session only for the original actor, device, and route lease. That session renders upload progress only and receives no route or workspace controls.

The route loader drains bounded backend pages, obtains a server lease, and atomically replaces the actor/vendor/device SQLite snapshot. Every delivered, agent-skip, or missed outcome is committed to the immutable SQLite queue before network submission. One serialized runner reuses the stored request and idempotency key, recovers abandoned `sending` rows, retries boundedly on startup, foreground, reconnect, enqueue, or manual request, and exposes pending, sending, retryable, synchronized, and conflict states. There is no second online write path.

SQLite contains only delivery-required route fields and action projections. Reads and writes require actor/device scope; standard route reads add vendor scope and recovery adds the exact lease. Pending, sending, retryable, and conflict rows are never automatically deleted. Expired synchronized rows and then-unreferenced expired route projections are removed after synchronization lifecycle runs. Logout publishes the just-enqueued snapshot before network drain and performs a final scoped SQLite count.

`EXPO_PUBLIC_API_BASE_URL` remains the sole public runtime setting. It accepts only an absolute, credential-free HTTP(S) origin. The committed OpenAPI artifact records its backend commit and SHA-256 provenance.

## Deliberate constraints

There is no queue discard, edit, export, device transfer, key reset, forced logout bypass, raw conflict resolution, background scheduler, ORM, or separate database-encryption layer. Correctness depends on durable state plus explicit lifecycle triggers, not opportunistic background execution.

## Device gate

`eas.json` defines an internal Android APK profile. The Phase 3 online flow and Phase 4 airplane-mode/restart flow consume a freshly reset backend fixture and an already authenticated session. APK installation, device execution, the five-second Phase 3 KPI, and the sub-500-ms Phase 4 local acknowledgement require recorded native evidence in `docs/phase-4-offline-device-evidence.md`.

## Repository lifecycle

This repository owns its Git history, Dockerfile, Compose service, CI workflow, dependencies, tests, and releases. Docker provides Node.js 24 for local development and checks; a mobile runtime renders the app.
