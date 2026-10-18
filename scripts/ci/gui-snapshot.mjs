import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';

export const guiRepository = 'kubohiroya/scratch-gui';
export const publicBuildInfo = 'https://kubohiroya.github.io/scratch-gui/build-info.json';
const sha = value => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);

export function validateSnapshot(value) {
    assert.equal(value?.status, 'observed', 'GUI snapshot unavailable');
    assert.ok(Number.isFinite(Date.parse(value.observedAt)), 'Invalid GUI observation time');
    assert.equal(value.repository, guiRepository);
    assert.ok(sha(value.develop));
    assert.ok(Number.isSafeInteger(value.deployment?.id) && value.deployment.id > 0);
    assert.ok(sha(value.deployment.sha));
    assert.equal(value.buildInfo?.repository, `https://github.com/${guiRepository}`);
    assert.equal(value.buildInfo?.coreRepository, 'https://github.com/kubohiroya/turbowarp-extension-data-editor');
    assert.ok(sha(value.buildInfo.revision) && sha(value.buildInfo.coreRevision));
    return value;
}

export async function captureGUI({fetchImpl = fetch, now = Date.now} = {}) {
    const result = {repository: guiRepository, observedAt: new Date(now()).toISOString()};
    try {
        const get = async url => {
            // Public GUI endpoints never receive either repository's credentials.
            const response = await fetchImpl(url, {redirect: 'error', signal: AbortSignal.timeout(15_000),
                headers: {Accept: 'application/json'}});
            assert.ok(response.ok, 'Public GUI observation failed');
            return response.json();
        };
        const [branch, deployments, buildInfo] = await Promise.all([
            get(`https://api.github.com/repos/${guiRepository}/branches/develop`),
            get(`https://api.github.com/repos/${guiRepository}/deployments?environment=github-pages&per_page=1`),
            get(publicBuildInfo)
        ]);
        return validateSnapshot({...result, status: 'observed', develop: branch.commit?.sha,
            deployment: {id: deployments[0]?.id, sha: deployments[0]?.sha}, buildInfo});
    } catch {
        return {...result, status: 'unavailable'};
    }
}

export function compareGUI(before, after) {
    validateSnapshot(before); validateSnapshot(after);
    assert.ok(Date.parse(before.observedAt) <= Date.parse(after.observedAt), 'GUI observations reversed');
    const fields = value => ({develop: value.develop, deployment: value.deployment, buildInfo: value.buildInfo});
    return isDeepStrictEqual(fields(before), fields(after)) ? 'unchanged' : 'changed';
}
