const getGuiRoot = require('./gui-root.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const {createRequire} = require('node:module');

// Reuse the application already compiled by CI with ROOT=/scratch-gui/.
const main = async () => {
    const root = getGuiRoot();
    const output = path.join(root, 'build');
    const revision = process.env.BUILD_REVISION || execFileSync('git', ['rev-parse', 'HEAD'],
        {cwd: root, encoding: 'utf8'}).trim();
    const hostRequire = createRequire(path.join(root, 'package.json'));
    const {revision: coreRevision} = hostRequire('@kubohiroya/turbowarp-extension-data-editor/build-info');
    const {generatePages} = await import(pathToFileURL(path.join(root, 'scripts/generate-pages.mjs')).href);
    await fs.rename(path.join(output, 'index.html'), path.join(output, 'player.html'));
    await generatePages(output, revision, coreRevision);
};
if (require.main === module) {
    main().catch(error => {
        console.error(error); process.exitCode = 1;
    });
}
