import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

const sortKeys = (value) => Array.isArray(value)
  ? value.map(sortKeys)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]))
    : value;

const [sourceUrl, sourceCommit] = process.argv.slice(2);
if (!sourceUrl || !/^[0-9a-f]{40}$/.test(sourceCommit ?? '')) throw new Error('Usage: import-openapi <url> <40-char backend commit>');
const response = await fetch(sourceUrl);
if (!response.ok) throw new Error(`OpenAPI fetch failed: ${response.status}`);
const document = await response.json();
if (!document.paths?.['/v1/health'] || typeof document.info?.version !== 'string') throw new Error('Backend artifact lacks Phase 0 health/version contract');
const artifact = `${JSON.stringify(sortKeys(document), null, 2)}\n`;
await mkdir('openapi', { recursive: true });
await writeFile('openapi/openapi.json', artifact);
await writeFile('openapi/provenance.json', `${JSON.stringify({
  schemaVersion: 1,
  sourceRepository: 'milktrack-backend',
  sourceCommit,
  apiVersion: document.info.version,
  openapiVersion: document.openapi,
  sha256: createHash('sha256').update(artifact).digest('hex'),
}, null, 2)}\n`);
