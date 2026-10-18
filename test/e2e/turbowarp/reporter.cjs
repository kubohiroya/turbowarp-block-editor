const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

class EvidenceReporter {
    constructor () {
        this.results = [];
    }
    onTestEnd (test, result) {
        const evidence = result.attachments.find(attachment => attachment.name === 'execution.json');
        let execution = {};
        if (evidence) {
            const text = evidence.body || (evidence.path && fs.readFileSync(evidence.path));
            if (text) execution = JSON.parse(text.toString());
        }
        this.results.push({title: test.title,
            project: test.parent.project().name,
            status: result.status,
            retry: result.retry,
            duration: result.duration,
            ...execution,
            error: result.errors.map(error => error.message).join('\n')});
    }
    onEnd (result) {
        const output = path.resolve(__dirname, '../../../test-results/block-editor');
        fs.mkdirSync(output, {recursive: true});
        fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify({
            status: result.status, platform: `${os.platform()} ${os.release()}`, results: this.results
        }, null, 2));
        if (process.env.GITHUB_STEP_SUMMARY) {
            const rows = this.results.map(row => {
                const cells = [row.project, row.status, row.stage || 'browser/setup', row.nativeOSPicker || 'not-run'];
                return `| ${cells.join(' | ')} |`;
            });
            const summary = [
                `### Block editor E2E: ${result.status}`,
                `GUI: ${process.env.E2E_EXPECT_GUI_REVISION || 'see execution.json'}`,
                `core: ${process.env.E2E_EXPECT_CORE_REVISION || 'see execution.json'}`,
                ['| Route | Result | Last stage | Native OS picker |', '| --- | --- | --- | --- |',
                    ...rows].join('\n'),
                'Linux CI does not run the macOS native picker. See the attached reports and logs.'
            ].join('\n\n');
            fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
        }
    }
}
module.exports = EvidenceReporter;
