import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const artifact = await readFile('openapi/openapi.json', 'utf8');
const document = JSON.parse(artifact);
const provenance = JSON.parse(await readFile('openapi/provenance.json', 'utf8'));
const sha256 = createHash('sha256').update(artifact).digest('hex');
if (provenance.sourceRepository !== 'milktrack-backend') throw new Error('OpenAPI source repository mismatch');
if (!/^[0-9a-f]{40}$/.test(provenance.sourceCommit)) throw new Error('OpenAPI source commit is invalid');
if (provenance.apiVersion !== document.info?.version || provenance.openapiVersion !== document.openapi) throw new Error('OpenAPI version metadata mismatch');
if (!document.paths?.['/v1/health']) throw new Error('OpenAPI health operation missing');
if (provenance.sha256 !== sha256) throw new Error('OpenAPI artifact hash mismatch');
