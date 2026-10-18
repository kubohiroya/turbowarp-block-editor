import {execFileSync} from 'node:child_process';
import {readFile, writeFile} from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const {name, version, repository} = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const revision = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('A full source revision is required.');
await writeFile(new URL('dist/build-info.json', root), JSON.stringify({
  name, version, repository: repository.url.replace(/^git\+/, '').replace(/\.git$/, ''), revision
}, null, 2) + '\n');
