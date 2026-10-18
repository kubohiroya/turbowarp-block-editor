const getGuiRoot = require('./gui-root.cjs');
const fs = require('node:fs');
const {execFileSync} = require('node:child_process');

const patterns = [
    /^(src|site|scripts)\//,
    /^test\/(?:e2e|unit\/(?:block-editor|pages))\//,
    /^package(?:-lock)?\.json$/,
    /^webpack[^/]*\.js$/,
    /^\.github\/workflows\//
];
const relevant = file => patterns.some(pattern => pattern.test(file));
const select = (event, diff) => {
    const before = event.pull_request?.base?.sha || event.before;
    // New branches and unavailable history run the checks instead of silently skipping them.
    if (!before || /^0+$/.test(before)) return true;
    try {
        return diff(before).some(relevant);
    } catch {
        return true;
    }
};

if (require.main === module) {
    const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    const run = select(event, before => execFileSync('git', ['diff', '--name-only', '-z', before, 'HEAD'],
        {cwd: getGuiRoot(), encoding: 'utf8'}).split('\0')
        .filter(Boolean));
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `run=${run}\n`);
}
module.exports = {relevant, select};
