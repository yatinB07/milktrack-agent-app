# Phase 4 offline device evidence

Status: Pending native execution

This file is the release-gate record for the delivery-agent Android build. It
does not claim device results that have not been observed. The current host
does not provide an Android SDK/emulator, ADB, Maestro CLI, or an authenticated
EAS build session, so every native row below remains pending.

## Required setup

1. Start the committed backend and reset the Phase 3 agent fixture.
2. Build and install the `maestro` Android APK from `eas.json`.
3. Sign in as the seeded agent and load the complete leased route.
4. Record the APK build URL/ID, backend commit, agent-app commit, Android
   version, device model, Maestro version, tester, and UTC execution time.
5. Run `maestro test .maestro/phase4-offline-restart.yaml`.

The flow preserves app state, turns Android airplane mode on, records a local
outcome, force-stops and reopens the app, proves the pending action survived,
reconnects, and waits for server acknowledgement. Its completion hook always
turns airplane mode off.

## KPI record

| Gate | Required result | Recorded result | Status |
|---|---:|---:|---|
| Phase 3 average outcome entry | under 5 seconds per household | Not run | Pending |
| Phase 4 local acknowledgement under 500 ms | under 500 ms from confirm tap to “Saved on device” | Not run | Pending |

For each KPI, attach the raw per-run timings, sample count, average, device
model, Android version, build ID, and recording or Maestro artifact. Do not
replace device timings with Jest or container timings.

## Scenario record

| Scenario | Required observation | Result / artifact | Status |
|---|---|---|---|
| Airplane mode | Outcome is saved locally without server acknowledgement | Not run | Pending |
| Force-stop and restart | Pending action and route-safe display survive restart | Not run | Pending |
| Abandoned `sending` recovery | Restart returns the same immutable action to processing | Not run | Pending |
| Intermittent reconnect | One serialized runner resumes in local-sequence order | Not run | Pending |
| Duplicate retry | Same idempotency key and payload produce one server outcome/charge | Not run | Pending |
| Stale route | New outcome entry is blocked after lease expiry | Not run | Pending |
| Server conflict | Agent sees “Vendor review required” with no edit/delete control | Not run | Pending |
| Logout protection | Pending/sending/retryable rows prevent logout | Not run | Pending |
| Revoked-access recovery | Same phone and original device upload only the selected route lease; normal workspace controls remain denied | Not run | Pending |
| Crash after server acknowledgement | Replay returns the original result and the local row reaches synchronized without a duplicate | Not run | Pending |

## Sign-off

- Executor:
- Reviewer:
- APK build ID:
- Backend commit:
- Agent-app commit:
- Device and Android version:
- Maestro version:
- Execution time (UTC):
- Attached artifacts:
- Final gate decision: Pending
