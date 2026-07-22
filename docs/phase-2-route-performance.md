# Phase 2 route performance evidence

## Automated baseline

The route screen uses bounded API pages and a virtualized `SectionList` configured with an initial batch of 10 rows, subsequent batches of 10, and a window size of 7. The regression test measures a warm render and stop-row interaction with React Native's test renderer.

Run the reproducible baseline from this repository:

```bash
docker compose run --rm -e REPORT_PERFORMANCE=1 agent \
  npm test -- --runTestsByPath src/screens/__tests__/RouteScreen.test.tsx
```

Recorded on 2026-07-22 in the repository's Node 24 Linux container:

- Warm route render: 6 ms
- Stop-row interaction: below the timer's 1 ms resolution
- Enforced regression budgets: 1,000 ms render and 250 ms interaction

These broad CI budgets detect large rendering regressions; they are not a substitute for production-device profiling.

## Device flow

Install the development build on a supported Android or iOS device, sign in with the seeded delivery-agent account, select a workspace when prompted, and ensure the vendor has a scheduled stop for the backend-selected service date. Then run:

```bash
maestro test .maestro/phase2-route.yaml
```

The flow verifies route presentation, stop-detail navigation, and return navigation. Release-device performance budgets, low-end-device coverage, and cold-start profiling remain Phase 7 hardening gates.
