#!/bin/sh
set -eu
exec docker run --rm --user "$(id -u):$(id -g)" \
  -e npm_config_cache=/tmp/npm-cache \
  --add-host host.docker.internal:host-gateway \
  -v "$PWD:/app" -w /app node:24-bookworm-slim "$@"
