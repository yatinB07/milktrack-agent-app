# MilkTrack Agent

Expo SDK 57 delivery-agent application. It provides backend-connected phone OTP, encrypted refresh-token storage, authenticated route access, and online delivered, agent-skip, and missed outcome recording.

## Prerequisites

- Docker with Docker Compose
- Expo Go, an Android/iOS simulator, or a development device

Host Node.js is not required.

## Start Metro

```sh
cp .env.example .env
# Set EXPO_PACKAGER_HOSTNAME in .env to this computer's LAN address.
docker compose --env-file .env up --build
```

Open the shown `exp://<LAN-IP>:8082` URL in Expo Go, or connect a simulator. Use `docker compose --env-file .env down` to stop Metro.

The backend URL depends on the runtime:

- Android emulator: `http://10.0.2.2:3000`
- iOS simulator: `http://127.0.0.1:3000`
- Physical device: `http://<computer-LAN-IP>:3000`

The device and computer must be able to reach each other. Production and remote development URLs must use HTTPS.

In local development, request an OTP in the app and read the development-only code from the backend container log. Non-development environments require a real OTP provider.

## Phase 3 Android device flow

Reset the deterministic fixture from `milktrack-backend` before each run:

```sh
docker compose --env-file .env run --rm -e APP_ENV=development -e NODE_ENV=development migrate npm run db:seed:phase3-agent -- --reset
```

The seeded app identity is `Development Vendor A Delivery Agent (+919876543210)`.

For Expo Go or local builds, set `EXPO_PUBLIC_API_BASE_URL` in this repository's ignored local `.env` to an origin the device can reach.

Remote EAS builds do not read the ignored local `.env`. Configure the public API origin as a plaintext variable in the `preview` EAS environment selected by the `maestro` profile, then verify its presence:

```sh
eas env:create --environment preview --name EXPO_PUBLIC_API_BASE_URL --visibility plaintext
eas env:list --environment preview
```

Enter a device-reachable HTTPS API origin when prompted. Never put credentials in this public variable, `eas.json`, or committed environment examples.

Build the internal Android APK with `eas build --platform android --profile maestro`, install the downloaded APK, sign in with the seeded delivery-agent identity, then run:

```sh
maestro test .maestro/phase3-online-outcomes.yaml
```

The flow preserves app state, so it requires an authenticated session and the freshly reset fixture. APK execution and the five-second device KPI are release-gate steps, not part of repository verification.

## Verify

```sh
docker compose --env-file .env.example run --rm agent npm test
docker compose --env-file .env.example run --rm agent npm run verify
docker build --target checks -t milktrack-agent-app:checks .
```

## Refresh the OpenAPI contract

Import only from a clean, committed backend repository:

```sh
docker compose -f ../milktrack-backend/compose.yaml --env-file ../milktrack-backend/.env.example up -d --build --wait
BACKEND_HEAD="$(git -C ../milktrack-backend rev-parse HEAD)"
sh scripts/node24.sh node scripts/import-openapi.mjs http://host.docker.internal:3000/openapi.json "$BACKEND_HEAD"
sh scripts/node24.sh npm run api:generate
sh scripts/node24.sh npm run api:check
```

Commit `openapi/openapi.json`, `openapi/provenance.json`, and generated `src/api/schema.d.ts` together. Never edit the generated schema manually.
