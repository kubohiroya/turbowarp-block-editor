const assert = require('node:assert/strict');
const {test} = require('node:test');
const {readFileSync} = require('node:fs');
const YAML = require('yaml');
const mod = import('../../scripts/site/source.mjs');
const sha = 'a'.repeat(40);
const env = {GITHUB_REPOSITORY: 'kubohiroya/turbowarp-extension-data-editor', GITHUB_REF: 'refs/heads/main',
    GITHUB_EVENT_NAME: 'push', GITHUB_SHA: sha, GH_TOKEN: 'common-read-token'};
const pins = {guiRepository: 'kubohiroya/scratch-gui', guiRevision: sha, coreRevision: 'b'.repeat(40)};

test('only current common main push/manual sources may publish', async () => {
    const {checkSource, sourcePins} = await mod;
    for (const event of ['push', 'workflow_dispatch']) assert.equal(await checkSource({...env, GITHUB_EVENT_NAME: event},
        {fetchImpl: async () => ({ok: true, json: async () => ({commit: {sha}})})}), sha);
    for (const patch of [{GITHUB_REF: 'refs/heads/develop'}, {GITHUB_REF: 'refs/tags/main'},
        {GITHUB_EVENT_NAME: 'pull_request'}, {GITHUB_REPOSITORY: 'kubohiroya/scratch-gui'}, {GITHUB_SHA: 'main'}, {GH_TOKEN: ''}]) {
        await assert.rejects(checkSource({...env, ...patch}, {fetchImpl: () => assert.fail('must not request')}));
    }
    for (const reply of [{ok: false}, {ok: true, json: async () => ({commit: {sha: 'c'.repeat(40)}})}]) {
        await assert.rejects(checkSource(env, {fetchImpl: async () => reply}));
    }
    for (const patch of [{guiRepository: 'other/repo'}, {guiRevision: 'main'}, {coreRevision: 'b'.repeat(7)}]) {
        assert.throws(() => sourcePins({...pins, ...patch}));
    }
});

test('pinned GUI CI is read without forwarding the common token and latest failure is rejected', async () => {
    const {checkGUI} = await mod;
    for (const conclusion of ['success', 'failure']) {
        const run = {id: 7, run_number: 1, run_attempt: 3, workflow_id: 5, head_sha: sha, head_branch: 'develop', event: 'push',
            repository: {full_name: pins.guiRepository}, head_repository: {full_name: pins.guiRepository},
            status: 'completed', conclusion, html_url: 'https://github.com/kubohiroya/scratch-gui/actions/runs/7'};
        const fetchImpl = async (url, options) => {
            assert.equal(options.headers.Authorization, undefined);
            let value;
            if (url.includes('/workflows/node.js.yml')) value = {id: 5, path: '.github/workflows/node.js.yml', state: 'active'};
            else if (url.includes('/workflows/5/runs?')) value = {total_count: 1, workflow_runs: [run]};
            else if (url.endsWith('/runs/7')) value = run;
            else assert.fail(url);
            return {ok: true, json: async () => value};
        };
        if (conclusion === 'success') assert.equal((await checkGUI(pins, {fetchImpl})).decision, 'accepted');
        else await assert.rejects(checkGUI(pins, {fetchImpl}), /failure/);
    }
});

test('Pages permissions are isolated to deploy; CI and GUI freshness gates precede publication', () => {
    const w = YAML.parse(readFileSync(new URL('../../.github/workflows/pages.yml', `file://${__filename}`), 'utf8'));
    assert.deepEqual(w.on.push.branches, ['main']);
    assert.match(w.jobs.build.if, /refs\/heads\/main/);
    assert.equal(w.jobs['ci-gate'].with.expected_revision, '${{ github.sha }}');
    assert.equal(w.jobs['ci-gate'].with.workflow_file, 'ci.yml');
    assert.deepEqual(w.jobs.deploy.needs, ['build', 'ci-gate']);
    assert.equal(w.jobs.deploy.permissions.pages, 'write');
    assert.equal(w.jobs.deploy.permissions['id-token'], 'write');
    assert.equal(w.jobs.deploy.if, undefined);
    assert.ok(w.jobs.deploy.steps.some(s => s.run === 'node scripts/site/source.mjs'));
    for (const [name, job] of Object.entries(w.jobs)) if (name !== 'deploy') {
        const p = job.permissions || w.permissions;
        assert.equal(p.pages, undefined); assert.equal(p['id-token'], undefined);
        assert.equal(job.environment, undefined);
    }
});
