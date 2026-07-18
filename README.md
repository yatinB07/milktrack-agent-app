# MilkTrack Agent

Expo SDK 57 delivery-agent application. Phase 0 provides phone-authentication and authenticated navigation shells plus backend health/connectivity status. It does not store routes or delivery actions.

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

Open the shown `exp://<LAN-IP>:8081` URL in Expo Go, or connect a simulator. Use `docker compose --env-file .env down` to stop Metro.

The backend URL depends on the runtime:

- Android emulator: `http://10.0.2.2:3000`
- iOS simulator: `http://127.0.0.1:3000`
- Physical device: `http://<computer-LAN-IP>:3000`

The device and computer must be able to reach each other. Production and remote development URLs must use HTTPS.

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
