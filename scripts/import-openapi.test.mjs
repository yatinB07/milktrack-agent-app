import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { promisify } from 'node:util';
import test from 'node:test';

const run = promisify(execFile);
const importer = join(dirname(fileURLToPath(import.meta.url)), 'import-openapi.mjs');

test('canonicalizes imported OpenAPI object keys while preserving array order', async () => {
  const document = {
    paths: { '/v1/health': { get: { tags: ['zeta', 'alpha'], responses: { 200: { description: 'ok' } } } } },
    info: { version: '3.0.0', title: 'MilkTrack' },
    openapi: '3.1.0',
    components: { schemas: { Example: { required: ['zeta', 'alpha'], properties: { zeta: { type: 'string' }, alpha: { type: 'number' } } } } },
  };
  const expectedArtifact = `${JSON.stringify({
    components: { schemas: { Example: { properties: { alpha: { type: 'number' }, zeta: { type: 'string' } }, required: ['zeta', 'alpha'] } } },
    info: { title: 'MilkTrack', version: '3.0.0' },
    openapi: '3.1.0',
    paths: { '/v1/health': { get: { responses: { 200: { description: 'ok' } }, tags: ['zeta', 'alpha'] } } },
  }, null, 2)}\n`;
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(document));
  });
  const workingDirectory = await mkdtemp(join(tmpdir(), 'milktrack-openapi-'));

  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    await run(process.execPath, [importer, `http://127.0.0.1:${port}/openapi`, 'a'.repeat(40)], { cwd: workingDirectory });

    const artifact = await readFile(join(workingDirectory, 'openapi/openapi.json'), 'utf8');
    const provenance = JSON.parse(await readFile(join(workingDirectory, 'openapi/provenance.json'), 'utf8'));

    assert.equal(artifact, expectedArtifact);
    assert.equal(provenance.sha256, createHash('sha256').update(expectedArtifact).digest('hex'));
  } finally {
    server.close();
    await rm(workingDirectory, { recursive: true, force: true });
  }
});

test('pins the Phase 4 offline contract and its provenance', async () => {
  const document = JSON.parse(await readFile(join(process.cwd(), 'openapi/openapi.json'), 'utf8'));
  const provenance = JSON.parse(await readFile(join(process.cwd(), 'openapi/provenance.json'), 'utf8'));
  const schemas = document.components.schemas;

  assert.equal(provenance.sourceCommit, 'fccf5d110261f9b4429a2fe02cb47abcf4dc0919');
  assert.equal(provenance.sha256, '7f88e177c9367007e33a8817823ed20335ba87e227bc199b734ad1cf77dda974');
  assert.equal(document.paths['/v1/agent/vendors/{vendorId}/route-syncs'].post.operationId, 'AgentSyncController_createRouteSync');
  assert.deepEqual(schemas.RouteVersionDto.required, ['routeId', 'routeVersion', 'routeAssignmentId']);
  assert.deepEqual(schemas.RouteSyncResponseDto.required, ['routeSyncId', 'serverTime', 'expiresAt', 'routes']);
  assert.deepEqual(schemas.OfflineOutcomeEnvelopeDto.required, ['routeSyncId', 'payloadVersion', 'localSequence']);
  assert.deepEqual(schemas.SyncCheckpointRequestDto.required, ['pendingCount', 'sendingCount', 'failedRetryableCount', 'conflictCount']);
  assert.deepEqual(schemas.CurrentActorResponseDto.properties.accessMode.enum, ['standard', 'offline_recovery']);
  assert.equal(schemas.CurrentActorResponseDto.properties.recoveryRouteSyncId.format, 'uuid');
  assert.deepEqual(schemas.ApiErrorResponseDto.required, ['code', 'message', 'retryable', 'correlationId']);
  assert.deepEqual(schemas.OfflineOutcomeConflictResponseDto.required, ['code', 'message', 'retryable', 'correlationId', 'conflictId', 'conflictStatus']);
});
