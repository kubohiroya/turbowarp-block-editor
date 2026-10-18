import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {generateKeyPairSync, verify} from 'node:crypto';
import YAML from 'yaml';
import {captureGUI, compareGUI, guiRepository} from '../../scripts/ci/gui-snapshot.mjs';
import {repository, fixtureFile, probeFile, scenarios} from '../../scripts/ci/assert-rerun-probe.mjs';
import {verifyWeekly, checkPermissions, commentBody, postOnce, publishReport, appSession,
    requestAPI, evidenceAPI, pages, driverFile, issuePath} from '../../scripts/ci/report-weekly-ci.mjs';

const revision = 'a'.repeat(40), reporterSha = 'b'.repeat(40);
const date = n => new Date(1_800_000_000_000 + n * 1000).toISOString();
const log = permissions => `##[group]GITHUB_TOKEN Permissions\n${Object.entries({...permissions, Metadata: 'read'})
    .map(([k, v]) => `timestamp ${k}: ${v}`).join('\n')}\n##[endgroup]`;
const identity = (id, workflow, title) => ({id, workflow_id: workflow, head_sha: revision, head_branch: 'main',
    repository: {full_name: repository}, head_repository: {full_name: repository}, event: 'workflow_dispatch',
    run_attempt: 1, status: 'completed', conclusion: 'success', display_title: title});
const snapshot = n => ({repository: guiRepository, observedAt: date(n), status: 'observed', develop: 'c'.repeat(40),
    deployment: {id: 55, sha: 'c'.repeat(40)}, buildInfo: {repository: `https://github.com/${guiRepository}`,
        revision: 'c'.repeat(40), coreRepository: `https://github.com/${repository}`, coreRevision: 'd'.repeat(40)}});

function fixture() {
    const root = {...identity(10, 1), event: 'schedule', created_at: date(0), run_started_at: date(1), updated_at: date(100)};
    const ci = {...identity(20, 2, 'CI rerun fixture 10-1'), run_attempt: 3};
    const runs = new Map([[10, root], [20, ci]]), jobSets = new Map([['10-1', [{id: 100, name: 'orchestrate'}]]]);
    const logs = new Map([[100, log({Actions: 'write', Contents: 'read'})]]), artifacts = new Map();
    const e = {repository, sha: revision, branch: 'main', suite: '10-1', trigger: 'schedule', schedule: '37 2 * * 1',
        status: 'success', fixture: ci, probes: {}, pending: {}, gui: {before: snapshot(2), after: snapshot(99)},
        mutations: ['dispatch', 'dispatch', 'rerun', 'dispatch', 'dispatch', 'rerun', 'dispatch']
            .map(operation => ({operation, ...(operation === 'rerun' ? {runId: 20} : {})}))};
    let id = 30;
    for (const [scenario, expected] of Object.entries(scenarios)) {
        const run = {...identity(id++, 3, `CI rerun observer 10-1 ${scenario}`), conclusion: expected.conclusion};
        runs.set(run.id, run);
        const positive = expected.conclusion === 'success';
        const jobs = [{id: run.id * 10, name: 'gate / gate', conclusion: expected.conclusion, completed_at: date(70)},
            {id: run.id * 10 + 1, name: 'publish-sentinel', conclusion: positive ? 'success' : 'skipped', started_at: positive ? date(71) : undefined},
            {id: run.id * 10 + 2, name: 'assert-probe', conclusion: 'success'}];
        jobSets.set(`${run.id}-1`, jobs);
        for (const job of jobs) logs.set(job.id, log({Actions: 'read', Contents: 'read'}));
        const decision = {repository, workflowFile: fixtureFile, workflowId: 2, expectedRevision: revision,
            branch: 'main', event: 'workflow_dispatch', runId: 20, attempt: expected.attempt, status: 'completed',
            conclusion: expected.conclusion, decision: positive ? 'accepted' : 'rejected', observedAt: date(60),
            reason: positive ? 'Latest matching normal CI workflow succeeded' : 'Normal CI concluded failure'};
        const {workflowId, ...fields} = decision;
        e.probes[scenario] = {run, proof: {...fields, scenario, gate: expected.conclusion, sentinel: positive ? 'success' : 'skipped'}};
        artifacts.set(`${run.id}/normal-ci-gate-${run.id}-1`, decision);
        jobSets.set(`20-${expected.attempt}`, [{id: 200 + expected.attempt, name: 'fixture', started_at: date(10), completed_at: date(50)}]);
        logs.set(200 + expected.attempt, log({Contents: 'read'}));
        if (['pending-failure', 'success-after-wait'].includes(scenario)) e.pending[scenario] = {
            observedAt: date(30), before: {...ci, run_attempt: expected.attempt, status: 'in_progress', conclusion: null},
            after: {...ci, run_attempt: expected.attempt, status: 'in_progress', conclusion: null},
            jobs: [{name: 'gate / gate', status: 'in_progress', steps: [
                {name: 'Require the latest matching normal CI to succeed', status: 'in_progress'}]}]};
    }
    artifacts.set('10/ci-rerun-test-10-1', e);
    let freshReads = 0;
    const api = {
        async get(path) {
            const workflow = path.match(/^actions\/workflows\/(.+)$/);
            if (workflow) return {id: [driverFile, fixtureFile, probeFile].indexOf(workflow[1]) + 1,
                path: `.github/workflows/${workflow[1]}`};
            const historical = path.match(/^actions\/runs\/20\/attempts\/(\d+)$/);
            if (historical) return {...ci, run_attempt: Number(historical[1]), conclusion: Number(historical[1]) === 2 ? 'failure' : 'success'};
            const detail = path.match(/^actions\/runs\/(\d+)$/);
            assert.ok(detail, path); if (Number(detail[1]) === 10) freshReads++;
            return structuredClone(runs.get(Number(detail[1])));
        },
        async jobs(id, attempt) {return structuredClone(jobSets.get(`${id}-${attempt}`));},
        async log(id) {return logs.get(id);},
        async artifact(id, name) {assert.ok(artifacts.has(`${id}/${name}`)); return structuredClone(artifacts.get(`${id}/${name}`));},
        async source(_sha, file) {assert.equal(_sha, revision); return readFileSync(new URL(`../../.github/workflows/${file}`, import.meta.url), 'utf8');}
    };
    return {root, ci, runs, e, api, logs, jobSets, execute: () => verifyWeekly(10, {api, reporterSha}), freshReads: () => freshReads};
}

test('a genuine completed schedule is independently verified with exact artifacts, permissions and GUI snapshots', async () => {
    const h = fixture(), result = await h.execute();
    assert.equal(result.status, 'verified-success'); assert.equal(result.eligible, true);
    assert.equal(result.gui.comparison, 'unchanged'); assert.equal(result.observers.length, 4);
    assert.equal(h.freshReads(), 2);
    assert.match(commentBody(result), /ci-weekly-report:10:1/);
    assert.match(commentBody(result), /専用GitHub App/);
});

test('GUI changes are reported distinctly without attributing them to the test', async () => {
    const h = fixture(); h.e.gui.after.develop = 'e'.repeat(40);
    const result = await h.execute();
    assert.equal(result.status, 'verified-success'); assert.equal(result.gui.comparison, 'changed');
    assert.match(commentBody(result), /完全不変とは扱わない/);
});

for (const [name, mutate] of Object.entries({
    'manual source': h => {h.root.event = 'workflow_dispatch';},
    'wrong repo': h => {h.root.repository.full_name = guiRepository;},
    'wrong branch': h => {h.root.head_branch = 'feature';},
    'wrong workflow': h => {h.root.workflow_id = 7;},
    'pending latest attempt': h => {h.root.run_attempt = 2; h.root.status = 'in_progress';},
    'wrong schedule proof': h => {h.e.trigger = 'workflow_dispatch';},
    'wrong cron': h => {h.e.schedule = '0 * * * *';},
    'wrong SHA': h => {h.e.sha = 'f'.repeat(40);},
    'old attempt proof': h => {h.e.probes['failed-fresh'].proof.attempt = 1;},
    'missing pending proof': h => {delete h.e.pending['pending-failure'];},
    'premature sentinel': h => {h.e.pending['pending-failure'].jobs.push({name: 'publish-sentinel', status: 'in_progress'});},
    'early success sentinel': h => {h.jobSets.get('33-1')[1].started_at = date(3);},
    'fixture advanced': h => {h.ci.run_attempt = 4;},
    'missing GUI observations': h => {delete h.e.gui;},
    'unavailable GUI': h => {h.e.gui.after.status = 'unavailable';},
    'reversed GUI observations': h => {h.e.gui.before.observedAt = date(101);},
    'publication permission': h => {h.logs.set(100, log({Actions: 'write', Contents: 'read', Pages: 'write'}));},
    'OIDC permission': h => {h.logs.set(330, log({Actions: 'read', Contents: 'read', 'IdToken': 'write'}));},
    'missing runtime permissions': h => {h.logs.set(100, 'empty');},
    'API failure': h => {h.api.jobs = async () => {throw new Error('secret');};},
    'missing artifact': h => {h.api.artifact = async () => {throw new Error('missing');};},
    'malicious source permissions': h => {h.api.source = async () => 'permissions: write-all\njobs: {bad: {run: evil}}';}
})) {
    test(`weekly success is not claimed for ${name}`, async () => {
        const h = fixture(); mutate(h); const result = await h.execute();
        assert.notEqual(result.status, 'verified-success');
        assert.ok(!JSON.stringify(result).includes('secret'));
    });
}

test('a rerun starting during verification invalidates the old success', async () => {
    const h = fixture(), get = h.api.get;
    h.api.get = async path => {
        const value = await get(path);
        return path === 'actions/runs/10' && h.freshReads() > 1 ? {...value, run_attempt: 2, status: 'in_progress'} : value;
    };
    assert.equal((await h.execute()).status, 'unconfirmed');
});

test('failed/cancelled source runs remain failed and are eligible for honest reporting', async () => {
    for (const conclusion of ['failure', 'cancelled', 'timed_out']) {
        const h = fixture(); h.root.conclusion = conclusion;
        const result = await h.execute();
        assert.equal(result.status, 'source-failed'); assert.equal(result.eligible, true);
        assert.match(commentBody(result), /成功以外/);
    }
});

test('permission parsing requires an exact allowlist, including unknown write scopes', () => {
    checkPermissions(log({Contents: 'read'}), {Contents: 'read'});
    assert.throws(() => checkPermissions(log({Contents: 'read', Deployments: 'write'}), {Contents: 'read'}));
    assert.throws(() => checkPermissions(log({Contents: 'read'}) + log({Contents: 'read'}), {Contents: 'read'}));
});

test('public GUI snapshots do not receive credentials and API failures stay unavailable', async () => {
    const calls = [], expected = snapshot(2);
    const fetchImpl = async (url, options) => {
        calls.push({url, options});
        const value = url.includes('/branches/') ? {commit: {sha: expected.develop}} :
            url.includes('/deployments?') ? [expected.deployment] : expected.buildInfo;
        return {ok: true, json: async () => value};
    };
    const value = await captureGUI({fetchImpl, now: () => Date.parse(date(2))});
    assert.equal(compareGUI(value, expected), 'unchanged');
    assert.ok(calls.every(c => !c.options.headers.Authorization && c.options.redirect === 'error'));
    assert.equal((await captureGUI({fetchImpl: async () => {throw new Error('secret');}})).status, 'unavailable');
});

test('comment pagination and lost POST response do not create duplicate comments', async () => {
    const report = await fixture().execute(); let posts = 0, stored;
    const api = async (path, method, payload) => {
        if (method === 'POST') {
            posts++; assert.equal(path, issuePath); stored = {id: 987, body: payload.body,
                user: {login: 'weekly-reporter[bot]', type: 'Bot'}}; throw new Error('lost response');
        }
        const page = new URL(`https://api.github.com${path}`).searchParams.get('page');
        return page === '1' ? Array.from({length: 100}, (_, id) => ({id, body: 'other'})) : stored ? [stored] : [];
    };
    assert.equal((await postOnce(report, api, 'weekly-reporter[bot]')).status, 'already-posted');
    assert.equal((await postOnce(report, api, 'weekly-reporter[bot]')).id, 987); assert.equal(posts, 1);
    await assert.rejects(pages(async () => ({jobs: [], total_count: 1}), '/repos/a/b/jobs', 'jobs'), /Incomplete/);
});

test('uncertain posting never blindly retries POST, including 403 failures', async () => {
    let posts = 0;
    await assert.rejects(postOnce(await fixture().execute(), async (_path, method) => {
        if (method === 'POST') {posts++; throw new Error('403');} return [];
    }, 'weekly-reporter[bot]'), /no automatic second POST/);
    assert.equal(posts, 1);
});

test('publication rechecks the latest source attempt before acquiring the App credential', async () => {
    const h = fixture(), report = await h.execute(); h.root.run_attempt = 2;
    await assert.rejects(publishReport(report, {api: h.api, session: async () => {assert.fail('must not mint');}}));
});

test('publication always revokes the short-lived App token, including post failure', async () => {
    const h = fixture(), report = await h.execute(); let revoked = false;
    await assert.rejects(publishReport(report, {api: h.api, session: async () => ({
        api: async () => {throw new Error('403');}, botLogin: 'weekly-reporter[bot]', revoke: async () => {revoked = true;}
    })}));
    assert.equal(revoked, true);
});

test('signed downloads never forward tokens; errors never expose API responses', async () => {
    const calls = [];
    const api = requestAPI('secret', async (url, options) => {
        calls.push({url, options});
        return calls.length === 1 ? {status: 302, headers: new Headers({location: 'https://storage.example/log'})} :
            {ok: true, arrayBuffer: async () => new TextEncoder().encode('proof').buffer};
    });
    assert.equal(await api.download('/repos/a/b/log'), 'proof');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer secret');
    assert.equal(calls[1].options.headers, undefined);
    await assert.rejects(requestAPI('secret', async () => {throw new Error('secret');})('/repos/a/b'),
        error => !error.message.includes('secret'));
    await assert.rejects(requestAPI('secret', async () => ({status: 302,
        headers: new Headers({location: 'http://storage.example'})})).download('/repos/a/b'), /Unsafe/);
});

test('artifact downloads require one exact unexpired source artifact and read JSON without extraction', async () => {
    const {default: JSZip} = await import('@turbowarp/jszip');
    const zip = new JSZip(); zip.file('evidence.json', JSON.stringify({status: 'success'}));
    const bytes = await zip.generateAsync({type: 'uint8array'});
    for (const variant of ['valid', 'expired', 'wrong-run', 'duplicate', 'missing-file']) {
        const fetchImpl = async (url, options) => {
            if (url.includes('/runs/10/artifacts?')) {
                const a = {id: 3, name: 'ci-rerun-test-10-1', expired: variant === 'expired',
                    workflow_run: {id: variant === 'wrong-run' ? 11 : 10}, size_in_bytes: bytes.length};
                const artifacts = variant === 'duplicate' ? [a, a] : [a];
                return {ok: true, status: 200, json: async () => ({total_count: artifacts.length, artifacts})};
            }
            if (url.endsWith('/artifacts/3/zip')) return {status: 302, headers: new Headers({location: 'https://storage.example/artifact'})};
            assert.equal(options.headers, undefined);
            return {ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)};
        };
        const promise = evidenceAPI('read-only', fetchImpl).artifact(10, 'ci-rerun-test-10-1', variant === 'missing-file' ? 'other.json' : 'evidence.json');
        if (variant === 'valid') assert.deepEqual(await promise, {status: 'success'});
        else await assert.rejects(promise);
    }
});

const {privateKey, publicKey} = generateKeyPairSync('rsa', {modulusLength: 2048});
test('App JWT and issued token are scoped to GUI Issues only; extra permissions are refused and revoked', async () => {
    for (const bad of ['', 'installation', 'token', 'repository', 'expired']) {
        const calls = [];
        const fetchImpl = async (url, options) => {
            const path = new URL(url).pathname; calls.push({path, options});
            const permissions = {issues: 'write', metadata: 'read'};
            let value;
            if (path.endsWith('/installation')) {
                const jwt = options.headers.Authorization.slice(7).split('.');
                assert.ok(verify('RSA-SHA256', Buffer.from(jwt.slice(0, 2).join('.')), publicKey, Buffer.from(jwt[2], 'base64url')));
                const payload = JSON.parse(Buffer.from(jwt[1], 'base64url'));
                assert.equal(payload.iss, '123'); assert.equal(payload.iat, 1799999940); assert.equal(payload.exp, 1800000540);
                value = {id: 7, app_id: 123, app_slug: 'weekly-reporter', repository_selection: 'selected',
                    permissions: {...permissions, ...(bad === 'installation' ? {contents: 'write'} : {})}};
            } else if (path.endsWith('/access_tokens')) {
                assert.deepEqual(JSON.parse(options.body), {repositories: ['scratch-gui'], permissions: {issues: 'write'}});
                value = {token: 'app-token', permissions: {...permissions, ...(bad === 'token' ? {pages: 'write'} : {})},
                    repositories: [{full_name: bad === 'repository' ? 'other/repo' : guiRepository}],
                    expires_at: date(bad === 'expired' ? -1 : 3600)};
            } else if (path === '/installation/repositories') value = {total_count: 1, repositories: [{full_name: guiRepository}]};
            else if (path === '/installation/token') return {ok: true, status: 204};
            else assert.fail(path);
            return {ok: true, status: 200, json: async () => value};
        };
        const options = {fetchImpl, now: () => 1_800_000_000_000};
        if (bad) {
            await assert.rejects(appSession('123', privateKey, options));
            assert.equal(calls.some(c => c.path === '/installation/token'), bad !== 'installation');
        } else {const session = await appSession('123', privateKey, options); await session.revoke();}
    }
});

test('workflow separates read-only verification from App credentials and defaults publication off', () => {
    const w = YAML.parse(readFileSync(new URL('../../.github/workflows/ci-gate-rerun-report.yml', import.meta.url), 'utf8'));
    assert.deepEqual(w.on.workflow_run, {workflows: ['Test latest CI attempts without publishing'], types: ['completed'], branches: ['main']});
    assert.equal(w.on.workflow_dispatch.inputs.dry_run.default, true);
    assert.deepEqual(w.permissions, {contents: 'read', actions: 'read'});
    assert.doesNotMatch(JSON.stringify(w.jobs.verify), /secrets\.|PRIVATE_KEY|CI_REPORT_APP_ID/);
    assert.match(w.jobs.report.if, /CI_RERUN_REPORT_ENABLED == 'true'/);
    assert.match(w.jobs.report.if, /always\(\)/);
    assert.equal(w.jobs.report.needs, 'verify');
    for (const job of Object.values(w.jobs)) {
        assert.equal(job.environment, undefined); assert.equal(job.permissions, undefined);
        assert.doesNotMatch(JSON.stringify(job), /deploy-pages|npm publish|secrets: inherit/);
        for (const step of job.steps.filter(s => s.uses?.startsWith('actions/checkout'))) {
            assert.equal(step.with.ref, '${{ github.sha }}'); assert.equal(step.with['persist-credentials'], false);
        }
    }
});
