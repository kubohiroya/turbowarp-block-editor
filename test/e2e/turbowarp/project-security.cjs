const {expect} = require('@playwright/test');

// Confirm the source of every project extension through the real standard security dialog.
const approveProjectExtensions = async (page, sources, lang = 'en') => {
    const security = page.getByRole('dialog', {name: lang === 'ja' ? '機能拡張セキュリティ' : 'Extension Security', exact: true});
    await expect(security).toBeVisible();
    const rows = security.locator('article');
    await expect(rows).toHaveCount(sources.length);
    const actual = [];
    for (let index = 0; index < sources.length; index++) {
        const row = rows.nth(index);
        await row.getByRole('button', {name: lang === 'ja' ? '詳細' : 'Details', exact: true}).click();
        const source = row.getByRole('textbox');
        await expect(source).toBeVisible();
        await expect.poll(() => source.inputValue()).not.toBe('');
        actual.push(await source.inputValue());
    }
    expect(actual.sort()).toEqual([...sources].sort());
    await security.getByRole('button', {name: lang === 'ja' ? 'サンドボックスなし' : 'Without sandbox', exact: true}).click();
    await security.getByRole('button', {name: 'OK', exact: true}).click();
    await expect(security).toHaveCount(0);
};

module.exports = {approveProjectExtensions};
