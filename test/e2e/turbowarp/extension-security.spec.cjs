const JSZip = require('@turbowarp/jszip');
const {createHash} = require('node:crypto');
const {test, expect} = require('./fixtures.cjs');

const name = 'Security bundle fixture';
const description = 'Review the enclosing bundle metadata.';
const license = 'See the bundled extension notices below.';
const source = `// Name: ${name}\n// ID: securityfixture\n// Description: ${description}\n` +
    `// By: Fixture Author\n// License: ${license}\n// Unsandboxed: required\n` +
    '// Bundled extensions:\n// - Name: Nested fixture\n//   Description: Nested description\n' +
    '//   By: Nested author\n//   License: Nested license\n' +
    'globalThis.__securityFixtureStarted = (globalThis.__securityFixtureStarted || 0) + 1;\n' +
    'Scratch.extensions.register({getInfo(){return {id:"securityfixture",name:"Security fixture",' +
    'color1:"#5B67A5",color2:"#4D588C",color3:"#404874",' +
    'blocks:[{opcode:"value",blockType:Scratch.BlockType.REPORTER,text:"security fixture"}]};},value(){return 1;}});';

const projectURL = async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"></svg>';
    const assetId = createHash('md5').update(svg).digest('hex');
    const project = {targets: [{isStage:true,name:'Stage',variables:{},lists:{},broadcasts:{},comments:{},
        blocks:{fixture:{opcode:'securityfixture_value',next:null,parent:null,inputs:{},fields:{},
            shadow:false,topLevel:true,x:40,y:40}},currentCostume:0,
        costumes:[{name:'Blank',assetId,dataFormat:'svg',md5ext:`${assetId}.svg`,rotationCenterX:240,rotationCenterY:180}],
        sounds:[],volume:100,tempo:60,videoTransparency:50,videoState:'off',textToSpeechLanguage:null}],
        monitors:[],extensions:['securityfixture'],extensionURLs:{securityfixture:`data:text/javascript,${encodeURIComponent(source)}`},
        meta:{semver:'3.0.0',vm:'0.2.0',agent:'shared-security-fixture'}};
    const zip = new JSZip();
    zip.file('project.json',JSON.stringify(project));zip.file(`${assetId}.svg`,svg);
    return `data:application/octet-stream;base64,${await zip.generateAsync({type:'base64',compression:'DEFLATE'})}`;
};
const dialog = page => page.locator('.twextsec-modal');
const executions = page => page.evaluate(() => globalThis.__securityFixtureStarted || 0);
const labels = {
    ja:{mode:'サンドボックスなし',cancel:'キャンセル',yes:'はい',no:'いいえ'},
    en:{mode:'Without sandbox',cancel:'Cancel',yes:'Yes',no:'No'}
};
const open = async (page, language) => {
    await page.goto(`${language}/`);
    const href = await page.locator('a.button[href*="editor.html"]').first().getAttribute('href');
    const target = new URL(href,page.url());
    expect(target.searchParams.has('extensionSecurityBatch')).toBe(false);
    target.searchParams.set('project_url',await projectURL());
    await page.goto(target.href);
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).locator('.twextsec-info')).toContainText(name);
};

test('direct editor URLs use shared security without adding a startup switch', async ({page,baseURL,evidence}) => {
    evidence.stage('shared-security-direct-startup');
    const target = new URL('editor.html',baseURL);
    target.search = new URLSearchParams({lang:'ja',project_url:await projectURL()});
    await page.goto(target.href);
    await expect(dialog(page)).toBeVisible();
    expect(new URL(page.url()).searchParams.has('extensionSecurityBatch')).toBe(false);
    expect(await executions(page)).toBe(0);
});

for (const language of ['ja','en']) {
    test(`shared security from ${language} entry requires approval and retains bundle metadata`, async ({page,evidence}) => {
        evidence.stage('shared-security-approve');
        await page.setViewportSize({width:1280,height:600});
        await open(page,language);
        const info = dialog(page).locator('.twextsec-info');
        for (const value of ['securityfixture',description,'Fixture Author',license]) await expect(info).toContainText(value);
        await expect(info).not.toContainText('Nested description');
        await expect(dialog(page).locator('textarea')).toHaveCount(0);
        expect(await executions(page)).toBe(0);
        const mode = dialog(page).getByRole('radio',{name:`${name}: ${labels[language].mode}`,exact:true});
        await mode.check();
        const ok = dialog(page).getByRole('button',{name:'OK',exact:true});
        await expect(ok).toBeEnabled();
        const box = await ok.boundingBox();expect(box.y + box.height).toBeLessThanOrEqual(600);
        await ok.click();
        await expect(dialog(page)).toHaveCount(0);
        await expect.poll(() => executions(page)).toBe(1);
        // Restored choices still require explicit approval after reloading the project.
        await page.reload();
        await expect(dialog(page)).toBeVisible();
        await expect(dialog(page).getByRole('radio',{name:`${name}: ${labels[language].mode}`,exact:true})).toBeChecked();
        expect(await executions(page)).toBe(0);
        await dialog(page).getByRole('button',{name:'OK',exact:true}).click();
        await expect(dialog(page)).toHaveCount(0);
        await expect.poll(() => executions(page)).toBe(1);
    });

    test(`shared security from ${language} entry cancels without executing extensions`, async ({page,evidence}) => {
        evidence.stage('shared-security-cancel');
        await open(page,language);
        const mode = dialog(page).getByRole('radio',{name:`${name}: ${labels[language].mode}`,exact:true});
        await mode.check();
        await dialog(page).getByRole('button',{name:labels[language].cancel,exact:true}).click();
        await dialog(page).getByRole('button',{name:labels[language].no,exact:true}).click();
        await expect(mode).toBeChecked();expect(await executions(page)).toBe(0);
        await dialog(page).getByRole('button',{name:labels[language].cancel,exact:true}).click();
        await dialog(page).getByRole('button',{name:labels[language].yes,exact:true}).click();
        await expect(dialog(page)).toHaveCount(0);
        await expect.poll(() => new URL(page.url()).searchParams.has('project_url')).toBe(false);
        expect(new URL(page.url()).searchParams.has('extensionSecurityBatch')).toBe(false);
        await expect.poll(() => page.evaluate(() => vm.runtime.targets.length)).toBeGreaterThan(0);
        expect(await executions(page)).toBe(0);
        expect(await page.evaluate(() => vm.extensionManager.isExtensionLoaded('securityfixture'))).toBe(false);
    });
}
