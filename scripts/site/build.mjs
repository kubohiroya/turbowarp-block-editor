import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {generatePages} from './generate-pages.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const gui = process.env.E2E_GUI_ROOT;
assert.ok(gui && path.isAbsolute(gui), 'E2E_GUI_ROOT must be an absolute GUI checkout');
const pinned = JSON.parse(await fs.readFile(path.join(root, 'site/source.json'), 'utf8'));
const revision = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: gui, encoding: 'utf8'}).trim();
assert.equal(revision, pinned.guiRevision, 'GUI checkout differs from the site source pin');
const require = createRequire(path.join(gui, 'package.json'));
const {revision: coreRevision} = require('@kubohiroya/turbowarp-extension-data-editor/build-info');
assert.equal(coreRevision, pinned.coreRevision, 'Installed GUI package differs from the core source pin');
const siteRevision = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
const prefix = process.env.ROOT || '/turbowarp-extension-data-editor/';
assert.match(prefix, /^\/[\w/-]*\/$/);
const output = path.join(gui, 'build');
await fs.rm(output, {recursive: true, force: true});
const result = spawnSync(process.execPath, ['--openssl-legacy-provider',
    path.join(gui, 'node_modules/webpack/bin/webpack.js'), '--config', path.join(root, 'scripts/site/webpack.config.cjs'), '--bail'], {
    cwd: gui, stdio: 'inherit', env: {...process.env, NODE_ENV: 'production', ROOT: prefix, CI: '1'}
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
await fs.rename(path.join(output, 'index.html'), path.join(output, 'player.html'));
await generatePages(output, revision, coreRevision, {siteRevision, licensePath: path.join(gui, 'LICENSE')});
// Favicon selection is site policy, so it does not require a host-template patch.
const editor = path.join(output, 'editor.html');
let html = await fs.readFile(editor, 'utf8');
if (!/<link[^>]+rel=["']icon["']/.test(html)) html = html.replace('</head>', `<link rel="icon" href="${prefix}favicon.ico"></head>`);
await fs.writeFile(editor, html);
await fs.copyFile(path.join(gui, 'static/favicon.ico'), path.join(output, 'favicon.ico'));
console.log(`Site built for GUI ${revision}, package ${coreRevision}, site ${siteRevision}`);
