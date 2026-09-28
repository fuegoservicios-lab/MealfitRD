// @ts-check
/**
 * [P1-PLAN-LOTE-744 · G93 · 2026-09-28] El sistema de países, medido en el build REAL.
 *
 * `VITE_COUNTRY_SYSTEM` se resuelve en tiempo de build (`.env.production`, encendido desde el 18-ago), y este es el único
 * sitio donde la app corre con el valor de producción ya compilado. Lo que se ancla es lo que sólo existe con el sistema
 * encendido: el paso «¿En qué país haces la compra?» del wizard, con los seis países.
 *
 * El invitado NO entra en Configuración (`ProtectedRoute`: sólo `/`, `/assessment`, `/plan`, `/dashboard` y
 * `/dashboard/upgrade`), así que el camino es el wizard. Para no rellenar diez pantallas se siembra lo que el invitado
 * guarda en claro (`mealfit_form` sin campos sensibles, `secureFormStorage.js`) y la posición del wizard; el índice del
 * paso puede moverse si cambia el orden del wizard, por eso se prueba una ventana de posiciones hasta ver el título.
 * Sin clics que guarden nada: la suite no habla con servicios de fuera (`fixtures.js`).
 */
import { test, expect } from './fixtures';

const PAISES = ['República Dominicana', 'España', 'Estados Unidos', 'México', 'Puerto Rico', 'Colombia'];
const FORM = {
    appMode: 'plan', planSource: 'scratch', gender: 'female', age: 32, height: 165, weight: 62, weightUnit: 'kg',
    heightUnit: 'cm', activityLevel: 'moderate', scheduleType: 'standard', sleepHours: '7-8', stressLevel: 'low',
    cookingTime: '30min', householdSize: 1,
};

const sembrar = (page, paso) => page.addInitScript(([form, paso]) => {
    try {
        localStorage.setItem('mealfit_locale', 'es-DO');
        localStorage.setItem('mealfit_guest_mode', '1');
        localStorage.setItem('mealfit_guest_session_id', 'e2e-invitado-pais');
        sessionStorage.setItem('mealfit_guest_tab_alive', '1');
        localStorage.setItem('mealfit_form', JSON.stringify(form));
        localStorage.setItem('mealfit_wizard_step_mode', 'plan');
        localStorage.setItem('mealfit_wizard_step', JSON.stringify({ currentStep: paso, maxReachedStep: paso }));
    } catch { /* modo privado */ }
}, [FORM, paso]);

test('el wizard del build real pregunta el país con los seis países', async ({ browser }) => {
    const errores = [];
    let encontrado = false;
    for (let paso = 7; paso <= 14 && !encontrado; paso += 1) {
        const page = await browser.newPage();
        page.on('pageerror', (e) => errores.push(String(e)));
        await page.route('**/*', (route) => {
            let host = '';
            try { host = new URL(route.request().url()).hostname; } catch { /* data:, blob: */ }
            if (!host || host === '127.0.0.1' || host === 'localhost') return route.continue();
            return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
        });
        await sembrar(page, paso);
        await page.goto('/assessment');
        const titulo = page.getByText('¿En qué país haces la compra?', { exact: false });
        try {
            await expect(titulo.first()).toBeVisible({ timeout: 8000 });
            encontrado = true;
            for (const c of PAISES) {
                await expect(page.getByText(c, { exact: false }).first()).toBeVisible();
            }
        } catch (e) {
            if (encontrado) throw e;
        }
        await page.close();
    }
    expect(encontrado, 'ninguna posición 7-14 del wizard mostró el paso de país: ¿se apagó VITE_COUNTRY_SYSTEM en el build?').toBe(true);
    expect(errores).toEqual([]);
});
