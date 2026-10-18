const assert = require('node:assert/strict');
const {test} = require('node:test');
const {mkdtempSync, writeFileSync, readFileSync, rmSync} = require('node:fs');
const {tmpdir} = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

test('common publication resolves GUI/core pins from the deployed site SHA, not from served build-info', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'site-target-'));
    try {
        const revision = 'a'.repeat(40), gui = 'b'.repeat(40), core = 'c'.repeat(40);
        const preload = path.join(directory, 'api.cjs');
        writeFileSync(preload, `global.fetch = async url => {
            if (!url.startsWith('https://api.github.com/repos/kubohiroya/turbowarp-extension-data-editor/')) throw new Error('Wrong repo');
            let value;
            if (url.includes('/deployments?')) value = [{id:7, sha:'${revision}'}];
            else if (url.endsWith('/deployments/7/statuses')) value = [{state:'success'}];
            else if (url.endsWith('/contents/site/source.json?ref=${revision}')) value = {content: Buffer.from(JSON.stringify({guiRepository:'kubohiroya/scratch-gui',guiRevision:'${gui}',coreRevision:'${core}'})).toString('base64')};
            else throw new Error('Unexpected endpoint');
            return {ok:true,json:async()=>value};
        };`);
        const output = path.join(directory, 'output');
        const result = spawnSync(process.execPath, ['--require', preload,
            path.resolve(__dirname, '../e2e/turbowarp/public-target.cjs')], {
            cwd: directory, env: {...process.env, GITHUB_REPOSITORY: 'kubohiroya/turbowarp-extension-data-editor',
                EXPECTED_REVISION: '', GH_TOKEN: 'read-only', GITHUB_OUTPUT: output}, encoding: 'utf8'});
        assert.equal(result.status, 0, result.stderr);
        const target = JSON.parse(readFileSync(path.join(directory, 'test-results/block-editor-deployment/deployment-target.json')));
        assert.deepEqual(target, {base_url: 'https://kubohiroya.github.io/turbowarp-extension-data-editor/',
            gui_revision: gui, core_revision: core, site_revision: revision});
    } finally {rmSync(directory, {recursive: true, force: true});}
});
