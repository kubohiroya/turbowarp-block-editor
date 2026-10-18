const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {select, relevant} = require('./ci-scope.cjs');
const {sha, coreRevision} = require('./public-target.cjs');

test('PR checks include application, dependencies, workflow and deleted related paths', () => {
    for (const filename of ['src/lib/editor.js', 'package-lock.json', '.github/workflows/pages.yml',
        'test/e2e/block-editor/editor.spec.cjs', 'webpack.config.js', 'site/content.mjs']) {
        assert.equal(relevant(filename), true, filename);
    }
    assert.equal(relevant('docs/translation-notes.md'), false);
    const base = 'a'.repeat(40);
    assert.equal(select({pull_request: {base: {sha: base}}}, revision => {
        assert.equal(revision, base);
        return ['src/deleted-editor.js'];
    }), true);
    assert.equal(select({before: base}, () => ['README.md']), false);
});

test('new branches and missing history never skip regression checks', () => {
    assert.equal(select({before: '0'.repeat(40)}, () => []), true);
    assert.equal(select({}, () => []), true);
    assert.equal(select({before: 'a'.repeat(40)}, () => {
        throw new Error('missing history');
    }), true);
});

test('public checks require full immutable revisions and resolve the deployed core pin', () => {
    assert.equal(sha('a'.repeat(40)), true);
    for (const value of ['develop', 'abc123', `${'a'.repeat(40)}\n`, null]) assert.equal(sha(value), false);
    const workflow = 'repository: kubohiroya/turbowarp-block-editor\n' +
        '          ref: ec338023ca8123b1db50787601ca8c78ab06917d\n';
    assert.equal(coreRevision(workflow),
        'ec338023ca8123b1db50787601ca8c78ab06917d');
    assert.throws(() => coreRevision('repository: another/package\nref: main'), /pin/);
    assert.throws(() => coreRevision('repository: kubohiroya/turbowarp-block-editor\nref: main'), /pin/);
});


test('deployment selection failures preserve evidence before any browser starts', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'block-editor-target-test-'));
    try {
        const result = spawnSync(process.execPath, [path.join(__dirname, 'public-target.cjs')], {
            cwd: directory,
            env: {...process.env,
                GITHUB_REPOSITORY: 'invalid',
                GITHUB_STEP_SUMMARY: path.join(directory, 'summary.md')}
        });
        assert.equal(result.status, 1);
        const report = JSON.parse(fs.readFileSync(
            path.join(directory, 'test-results/block-editor-deployment/selection-error.json'), 'utf8'));
        assert.equal(report.stage, 'deployment-selection');
        assert.equal(report.browser, 'not-run');
        assert.equal(report.nativeOSPicker, 'not-run');
        assert.match(fs.readFileSync(path.join(directory, 'summary.md'), 'utf8'), /UI not run/);
    } finally {
        fs.rmSync(directory, {recursive: true, force: true});
    }
});


test('local host selection is explicit and independent of the caller working directory', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'block-editor-gui-root-'));
    const helper = path.join(__dirname, 'gui-root.cjs');
    try {
        fs.writeFileSync(path.join(directory, 'webpack.config.js'), 'module.exports = {};');
        const run = root => spawnSync(process.execPath, ['-e',
            `process.stdout.write(require(${JSON.stringify(helper)})())`], {
            cwd: os.tmpdir(), env: {...process.env, E2E_GUI_ROOT: root}, encoding: 'utf8'
        });
        assert.equal(run('').status, 1);
        assert.equal(run('relative').status, 1);
        assert.equal(run(path.join(directory, 'missing')).status, 1);
        const valid = run(directory);
        assert.equal(valid.status, 0);
        assert.equal(valid.stdout, directory);
    } finally {
        fs.rmSync(directory, {recursive: true, force: true});
    }
});
