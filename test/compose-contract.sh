#!/bin/sh
set -eu
services="$(docker compose --env-file .env.example config --services)"
[ "$services" = agent ] || { echo "expected only agent service" >&2; exit 1; }
config="$(docker compose --env-file .env.example config)"
printf '%s\n' "$config" | grep -F 'published: "8081"' >/dev/null
printf '%s\n' "$config" | grep -F 'target: /app' >/dev/null
printf '%s\n' "$config" | grep -F 'target: /app/node_modules' >/dev/null
printf '%s\n' "$config" | grep -F 'source: agent_node_modules' >/dev/null
printf '%s\n' "$config" | grep -F 'type: volume' >/dev/null
printf '%s\n' "$config" | grep -F 'EXPO_PUBLIC_API_BASE_URL:' >/dev/null
printf '%s\n' "$config" | grep -F 'REACT_NATIVE_PACKAGER_HOSTNAME:' >/dev/null
