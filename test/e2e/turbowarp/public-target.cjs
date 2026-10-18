const fs = require('node:fs');

const sha = value => typeof value === 'string' && value.length === 40 && /^[a-f0-9]{40}$/.test(value);
const coreRevision = workflow => {
    const match = workflow.match(
        /repository:\s*kubohiroya\/turbowarp-extension-data-editor\s+ref:\s*['"]?([a-f0-9]{40})(?=['"\s]|$)/
    );
    if (!match) throw new Error('The deployed Pages workflow must pin the editor package to a full SHA.');
    return match[1];
};
const main = async () => {
    const repository = process.env.GITHUB_REPOSITORY;
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '')) throw new Error('GITHUB_REPOSITORY is required.');
    const api = async endpoint => {
        const response = await fetch(`https://api.github.com/repos/${repository}/${endpoint}`, {
            headers: {Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json'},
            signal: AbortSignal.timeout(15_000)
        });
        if (!response.ok) throw new Error(`GitHub deployment lookup failed: HTTP ${response.status}`);
        return response.json();
    };
    let revision = process.env.EXPECTED_REVISION || '';
    if (!revision) {
        const deployments = await api('deployments?environment=github-pages&per_page=20');
        for (const deployment of deployments) {
            const statuses = await api(`deployments/${deployment.id}/statuses`);
            if (statuses[0]?.state === 'success' &&
                statuses.some(status => status.state === 'success')) {
                revision = deployment.sha;
                break;
            }
        }
    }
    if (!sha(revision)) throw new Error('A successful Pages deployment or an explicit full expected SHA is required.');
    const ownSite = repository === 'kubohiroya/turbowarp-extension-data-editor';
    let gui = revision, core;
    if (ownSite) {
        const file = await api(`contents/site/source.json?ref=${revision}`);
        const pins = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
        if (pins.guiRepository !== 'kubohiroya/scratch-gui' || !sha(pins.guiRevision) || !sha(pins.coreRevision)) throw new Error('Invalid site source pins');
        gui = pins.guiRevision; core = pins.coreRevision;
    } else {
        const workflow = await api(`contents/.github/workflows/pages.yml?ref=${revision}`);
        core = coreRevision(Buffer.from(workflow.content, 'base64').toString('utf8'));
    }
    const baseURL = new URL(process.env.PUBLIC_BASE_URL || `https://kubohiroya.github.io/${ownSite ? 'turbowarp-extension-data-editor' : 'scratch-gui'}/`);
    if (baseURL.protocol !== 'https:' || !baseURL.pathname.endsWith('/') || baseURL.search || baseURL.hash ||
        baseURL.username || baseURL.password) throw new Error('Use an HTTPS application root ending with /.');
    const output = {base_url: baseURL.href, gui_revision: gui, core_revision: core, site_revision: ownSite ? revision : ''};
    for (const [key, value] of Object.entries(output)) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
    }
    fs.mkdirSync('test-results/block-editor-deployment', {recursive: true});
    fs.writeFileSync('test-results/block-editor-deployment/deployment-target.json', JSON.stringify(output, null, 2));
};
if (require.main === module) {
    main().catch(error => {
        fs.mkdirSync('test-results/block-editor-deployment', {recursive: true});
        fs.writeFileSync('test-results/block-editor-deployment/selection-error.json', JSON.stringify({
            stage: 'deployment-selection',
            error: error.message,
            nativeOSPicker: 'not-run',
            platform: process.platform,
            browser: 'not-run'
        }, null, 2));
        if (process.env.GITHUB_STEP_SUMMARY) {
            fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
                '\nBlock editor E2E: deployment selection failed; UI not run.\n');
        }
        console.error(error); process.exitCode = 1;
    });
}
module.exports = {sha, coreRevision};
