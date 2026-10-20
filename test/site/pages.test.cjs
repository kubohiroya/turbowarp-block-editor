const assert = require('node:assert/strict');
const {test} = require('node:test');
const {mkdtemp, readFile, writeFile, readdir, rm} = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {selectLanguage} = require('../../site/language.cjs');
const {JSDOM} = require('jsdom');

test('language selection respects saved choice, ordered supported browser locales, and English fallback', () => {
    assert.equal(selectLanguage(['ja-JP', 'en-US']), 'ja');
    assert.equal(selectLanguage(['en-GB', 'ja-JP']), 'en');
    assert.equal(selectLanguage(['fr-FR', 'ja-JP']), 'ja');
    assert.equal(selectLanguage(['fr-FR']), 'en');
    assert.equal(selectLanguage([], 'ja'), 'ja');
    assert.equal(selectLanguage(['ja-JP'], 'en'), 'en');
    assert.equal(selectLanguage(['en-US'], 'unknown'), 'en');
});

test('generated language HTML has source credits, opt-in and rollback links, and subpath-safe assets', async t => {
    const output = await mkdtemp(path.join(os.tmpdir(), 'tw-pages-'));
    t.after(() => rm(output, {recursive: true, force: true}));
    const {generatePages} = await import('../../scripts/site/generate-pages.mjs');
    const revision = 'a'.repeat(40);
    const coreRevision = 'b'.repeat(40);
    await writeFile(path.join(output, 'LICENSE'), 'GPL fixture');
    await generatePages(output, revision, coreRevision);
    for (const language of ['ja', 'en']) {
        const dom = new JSDOM(await readFile(path.join(output, language, 'index.html'), 'utf8'), {
            url: `https://example.test/scratch-gui/${language}/`
        });
        const document = dom.window.document;
        assert.equal(document.documentElement.lang, language);
        const links = [...document.querySelectorAll('a')].map(a => new URL(a.href));
        assert.ok(links.some(url => url.hostname === 'turbowarp.org'));
        for (const flag of ['blockEditorDialogs', 'blockEditorSourceForms', 'blockEditorCommonLayout']) {
            assert.ok(links.some(url => url.pathname === '/scratch-gui/editor.html' && url.searchParams.get(flag) === '1'));
        }
        assert.ok(links.some(url => url.pathname === '/scratch-gui/editor.html' && !url.searchParams.has('blockEditorDialogs')));
        assert.ok(links.some(url => url.href === `https://github.com/kubohiroya/scratch-gui/tree/${revision}`));
        assert.ok(links.some(url => url.href === `https://github.com/kubohiroya/turbowarp-extension-data-editor/tree/${coreRevision}`));
        assert.ok(links.some(url => url.pathname === '/scratch-gui/LICENSE'));
        assert.equal(new URL(document.querySelector('link[rel=stylesheet]').href).pathname, '/scratch-gui/assets/style.css');
        assert.equal(document.querySelectorAll('[data-language]').length, 2);
        dom.window.close();
    }
    const info = JSON.parse(await readFile(path.join(output, 'build-info.json')));
    assert.deepEqual(info, {
        repository: 'https://github.com/kubohiroya/scratch-gui',
        revision,
        coreRepository: 'https://github.com/kubohiroya/turbowarp-extension-data-editor',
        coreRevision,
        siteRepository: 'https://github.com/kubohiroya/turbowarp-extension-data-editor', siteRevision: coreRevision
    });
});

test('missing or invalid core revision is rejected before generating public files', async t => {
    const output = await mkdtemp(path.join(os.tmpdir(), 'tw-pages-invalid-'));
    t.after(() => rm(output, {recursive: true, force: true}));
    const {generatePages} = await import('../../scripts/site/generate-pages.mjs');
    for (const coreRevision of [undefined, '', 'b'.repeat(7), 'z'.repeat(40)]) {
        await assert.rejects(generatePages(output, 'a'.repeat(40), coreRevision), /full core source revision/);
        assert.deepEqual(await readdir(output), []);
    }
});
