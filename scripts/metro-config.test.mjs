import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

test('Metro bundles the SQLite web WASM asset', () => {
  const path = resolve('metro.config.js');
  assert.equal(existsSync(path), true, 'metro.config.js must exist');

  const config = createRequire(import.meta.url)(path);
  assert.equal(config.resolver.assetExts.includes('wasm'), true);
});
