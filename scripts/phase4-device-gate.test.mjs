import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('commits the repeatable Phase 4 Android offline gate and honest evidence status', () => {
  const flow = read('.maestro/phase4-offline-restart.yaml');
  const evidence = read('docs/phase-4-offline-device-evidence.md');

  assert.match(flow, /onFlowComplete:[\s\S]*setAirplaneMode: disabled/);
  assert.match(flow, /setAirplaneMode: enabled/);
  assert.match(flow, /stopApp/);
  assert.match(flow, /launchApp:[\s\S]*clearState: false/);
  assert.match(flow, /Saved on device/);
  assert.match(flow, /Sent to MilkTrack/);
  assert.match(evidence, /Status: Pending native execution/);
  assert.match(evidence, /Phase 4 local acknowledgement under 500 ms/);
  assert.match(evidence, /crash after server acknowledgement/i);
});

test('documents the current offline architecture and operating flow', () => {
  assert.match(read('ARCHITECTURE.md'), /SQLite/);
  assert.match(read('ARCHITECTURE.md'), /offline_recovery/);
  assert.match(read('README.md'), /phase4-offline-restart\.yaml/);
  assert.match(read('CHANGELOG.md'), /durable offline/i);
});
