import { test, expect } from '@playwright/test';
test.use({ locale: 'es-DO' });
for (const width of [320, 390, 430, 1280]) {
    test(`nutrient rows fit at ${width}px and 200% text`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto('/e2e/fixtures/nutrients/index.html');
        await expect(page.getByRole('button', { name: /Ver todos los nutrientes/ })).toBeVisible();
        await page.screenshot({ path: `test-results/micros-collapsed-${width}.png`, fullPage: true });
        await page.getByRole('button', { name: /Ver todos los nutrientes/ }).click();
        await expect(page.getByText('Vitamina B6', { exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await page.screenshot({ path: `test-results/micros-expanded-${width}.png`, fullPage: true });
        await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await page.screenshot({ path: `test-results/micros-large-text-${width}.png`, fullPage: true });
        await page.getByRole('button', { name: 'Minerales', exact: true }).click();
        await expect(page.getByText('Yodo', { exact: true })).toBeVisible();
        await expect(page.getByText('Vitamina B6', { exact: true })).toHaveCount(0);
    });
}
test('shared PNG renders all indicators', async ({ page }) => {
    await page.goto('/e2e/fixtures/nutrients/index.html');
    await page.locator('#share-test').click();
    await expect(page.locator('#shared-card')).toBeVisible();
    await page.locator('#shared-card').screenshot({ path: 'test-results/micros-shared-card.png' });
});
for (const [locale, label, nutrient] of [['en-US', 'View all nutrients', 'Vitamin B6'], ['fr-FR', 'Voir tous les nutriments', 'Vitamine B6'], ['it-IT', 'Vedi tutti i nutrienti', 'Vitamina B6'], ['pt-BR', 'Ver todos os nutrientes', 'Vitamina B6']]) {
    test(`localized nutrient expansion in ${locale}`, async ({ browser }) => {
        const context = await browser.newContext({ locale, viewport: { width: 320, height: 900 } });
        const page = await context.newPage();
        await page.goto('http://127.0.0.1:5177/e2e/fixtures/nutrients/index.html');
        await page.getByRole('button', { name: new RegExp(label) }).click();
        await expect(page.getByText(nutrient, { exact: true })).toBeVisible();
        await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await page.screenshot({ path: `test-results/micros-${locale}.png`, fullPage: true });
        await context.close();
    });
}
test('light theme keeps names and totals readable', async ({ page }) => {
    await page.goto('/e2e/fixtures/nutrients/index.html');
    await page.evaluate(() => document.documentElement.dataset.theme = 'light');
    await page.getByRole('button', { name: /Ver todos los nutrientes/ }).click();
    await page.screenshot({ path: 'test-results/micros-light.png', fullPage: true });
    await expect(page.getByText('Magnesio', { exact: true })).toBeVisible();
});
