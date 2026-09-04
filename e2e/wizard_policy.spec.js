// [P1-ARQ25-F4-FORM · 2026-09-03] E2E guest + restore del wizard (gate de la Fase 4).
// El invitado entra por el CTA «Probar sin cuenta» del login (no por un flag a mano: la app decide
// qué significa ser invitado), ve el paso 0 del wizard y, tras recargar, sigue dentro del wizard
// (recuperación vía `mealfit_form` + sesión de invitado). Sin generar plan: cero crédito, cero LLM.
import { test, expect } from '@playwright/test';

const enterAsGuest = async (page) => {
  await page.goto('/login');
  const guestBtn = page.getByRole('button', { name: /sin cuenta|without an account|sem conta|sans compte|senza account/i });
  await expect(guestBtn).toBeVisible({ timeout: 15000 });
  await guestBtn.click();
  await expect(page).toHaveURL(/\/(assessment|dashboard|plan)/, { timeout: 15000 });
  if (!/\/assessment/.test(page.url())) await page.goto('/assessment');
  await expect(page).toHaveURL(/\/assessment/, { timeout: 15000 });
};

// Paso 0 del wizard: «¿Qué quieres que haga {app} por ti?» (es) / «…do for you?» (en) / pt / fr / it
const STEP0 = /por ti|for you|por você|pour vous|per te/i;

test.describe('wizard como invitado', () => {
  test('entra sin cuenta y ve el paso 0', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await enterAsGuest(page);
    await expect(page.getByText(STEP0).first()).toBeVisible({ timeout: 15000 });
    expect(errors).toEqual([]);
  });

  test('tras recargar, sigue en el wizard (recuperación)', async ({ page }) => {
    await enterAsGuest(page);
    await expect(page.getByText(STEP0).first()).toBeVisible({ timeout: 15000 });
    await page.reload();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15000 });
    await expect(page.getByText(STEP0).first()).toBeVisible({ timeout: 15000 });
  });
});
