import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';

const require = createRequire(import.meta.url);

test('distribution exposes source metadata without requiring a consumer Git checkout', async () => {
  const info = require('@kubohiroya/turbowarp-extension-data-editor/build-info');
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(info.name, manifest.name);
  assert.equal(info.version, manifest.version);
  assert.equal(info.repository, 'https://github.com/kubohiroya/turbowarp-extension-data-editor');
  assert.match(info.revision, /^[a-f0-9]{40}$/);
});
