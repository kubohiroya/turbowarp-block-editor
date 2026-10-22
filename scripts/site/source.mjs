import assert from 'node:assert/strict';
import {appendFileSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {requireSuccessfulCI} from '../ci/require-successful-ci.mjs';

export const repository = 'kubohiroya/turbowarp-extension-data-editor';
export function sourcePins(value) {
    assert.equal(value.guiRepository, 'kubohiroya/scratch-gui');
    for (const field of ['guiRevision', 'coreRevision']) assert.match(value[field] || '', /^[a-f0-9]{40}$/);
    return value;
}
export async function checkSource(env, {fetchImpl = fetch} = {}) {
    assert.equal(env.GITHUB_REPOSITORY, repository);
    assert.equal(env.GITHUB_REF, 'refs/heads/main');
    assert.ok(['push', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME));
    assert.match(env.GITHUB_SHA || '', /^[a-f0-9]{40}$/);
    assert.ok(env.GH_TOKEN);
    const response = await fetchImpl(`https://api.github.com/repos/${repository}/branches/main`, {
        headers: {Authorization: `Bearer ${env.GH_TOKEN}`, Accept: 'application/vnd.github+json'},
        redirect: 'error', signal: AbortSignal.timeout(15_000)
    });
    assert.ok(response.ok, 'Cannot verify current main');
    assert.equal((await response.json()).commit?.sha, env.GITHUB_SHA, 'Site source is stale');
    return env.GITHUB_SHA;
}
export async function checkGUI(pins, {fetchImpl = fetch, report = () => {}, now = Date.now, sleep} = {}) {
    sourcePins(pins);
    // Public source CI is observed without credentials or cross-repository writes.
    return requireSuccessfulCI({repository: pins.guiRepository, revision: pins.guiRevision,
        workflowFile: 'node.js.yml', branch: 'develop', event: 'push', token: '', api: 'https://api.github.com'}, {
        // Verification needs five sequential API reads, including the final run/attempt recheck.
        timeoutMs: 120_000, intervalMs: 5_000, report, now, sleep,
        fetchImpl: (url, options) => {
            const {Authorization, ...headers} = options.headers;
            return fetchImpl(url, {...options, headers});
        }
    });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const pins = sourcePins(JSON.parse(readFileSync(new URL('../../site/source.json', import.meta.url), 'utf8')));
        await checkSource(process.env);
        mkdirSync('test-results/site-source', {recursive: true});
        writeFileSync('test-results/site-source/source.json', JSON.stringify({siteRevision: process.env.GITHUB_SHA, ...pins}));
        await checkGUI(pins, {report: state => writeFileSync('test-results/site-source/gui-ci.json', JSON.stringify(state, null, 2))});
        if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT,
            `gui_revision=${pins.guiRevision}\ncore_revision=${pins.coreRevision}\n`);
    } catch {console.error('Site source or pinned GUI CI could not be verified; publishing stopped.'); process.exitCode = 1;}
}
