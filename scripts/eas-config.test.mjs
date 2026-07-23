import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const easConfig = JSON.parse(await readFile(new URL('../eas.json', import.meta.url), 'utf8'));
const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');

test('the Maestro build uses the documented EAS environment', () => {
  assert.equal(easConfig.build.maestro.environment, 'preview');
  assert.match(
    readme,
    /eas env:create --environment preview --name EXPO_PUBLIC_API_BASE_URL .*--visibility plaintext/,
  );
  assert.match(readme, /eas env:list --environment preview/);
});
