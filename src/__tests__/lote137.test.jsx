/* [P1-PLAN-LOTE-137 · 2026-09-20] La app ENTERA con el generador de planes apagado.
 *
 * El dueño, tras el lote 136 (Configuración): «quiero saber si en general con el generador apagado todo está al 100 %
 * listo para producción». Cinco auditorías; esta es la mitad del CLIENTE (la del servidor: `test_p1_plan_lote_137.py`).
 *
 *   · `/plan` es EL DISPARO de una generación, no una página: una llegada fría (URL, marcador) con el generador apagado
 *     lo reencendía pagando un crédito; con un plan vivo lo regeneraba sin confirmación.
 *   · El contador no depende del plan: ni el fallo de sincronización del plan ni un perfil lento lo tapan o lo echan
 *     al formulario; el espejo local del modo se siembra desde el perfil y muere con la sesión.
 *   · Rutas «de plan» por URL (`/dashboard/progress`, `/dashboard/recipes`) devuelven al contador.
 *   · Historial: «Reanudar el plan» donde todo el producto dice que está, y «Reactivar» enciende.
 *   · Agente: atajos del contador, y el icono de «Progreso» que tumbaba su menú en modo PLAN.
 *   · Configuración: encender SIN plan es ir al formulario (no un PUT que te deja sin contador).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, fireEvent } from './utils/test-utils';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import ProtectedRoute from '../components/layout/ProtectedRoute';
import { menuItemsDelAgente } from '../pages/AgentPage';
import { navItemsFor } from '../config/dashboardNav';

const leer = (rel) => readFileSync(resolve(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');

const base = { session: { user: { id: 'u1' } }, loadingAuth: false, loadingData: false, loadingProfile: false, isGuest: false };

const rutas = (
    <Routes>
        <Route path="/plan" element={<ProtectedRoute><div>GENERANDO</div></ProtectedRoute>} />
        <Route path="/assessment" element={<ProtectedRoute><div>FORMULARIO<Link to="/plan">FINALIZAR</Link></div></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><div>PANEL</div></ProtectedRoute>} />
    </Routes>
);
const montar = (entradas, customContext) => render(rutas, {
    customContext,
    wrapper: ({ children }) => <MemoryRouter initialEntries={entradas}>{children}</MemoryRouter>,
});

afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
});

describe('lote 137 · /plan no se dispara por una llegada fría', () => {
    it('generador apagado + URL directa a /plan ⇒ al panel, no a generar', () => {
        montar(['/plan'], { ...base, planData: null, userProfile: { health_profile: { age: 30 }, plan_mode: 'tracking' } });
        expect(screen.getByText('PANEL')).toBeInTheDocument();
        expect(screen.queryByText('GENERANDO')).not.toBeInTheDocument();
    });

    it('con un plan vivo (modo plan) tampoco: regenerar sin confirmación cuesta un crédito y pisa el plan', () => {
        montar(['/plan'], { ...base, planData: { id: 'p1', days: [{}] }, userProfile: { health_profile: { age: 30 }, plan_mode: 'plan' } });
        expect(screen.getByText('PANEL')).toBeInTheDocument();
    });

    it('la entrada legítima es PUSH (el cierre del formulario): esa sí llega', () => {
        // modo plan SIN plan: el formulario es su sitio (en contador la guarda POP de /assessment lo devolvería al panel)
        montar(['/assessment'], { ...base, planData: null, userProfile: { health_profile: { age: 30 }, plan_mode: 'plan' } });
        fireEvent.click(screen.getByText('FINALIZAR'));
        expect(screen.getByText('GENERANDO')).toBeInTheDocument();
    });

    it('un contador que cierra el formulario del plan (PUSH) también llega: así se enciende', () => {
        const src = leer('src/components/layout/ProtectedRoute.jsx');
        const i = src.indexOf("if (isOnPlan && navigationType === 'POP' && !_hasPendingPlanRecovery) {");
        expect(i).toBeGreaterThan(-1);
        const bloque = src.slice(i, i + 900);
        expect(bloque).toContain("planNavEntry?.type !== 'reload'");
        expect(bloque).toContain("(_modoEnPlan === 'tracking' || planData)");
    });

    it('con una generación en curso (bandera local) /plan es la pantalla de carga: no se toca', () => {
        window.localStorage.setItem('mealfit_plan_in_progress', JSON.stringify({ user_id: 'u1' }));
        montar(['/plan'], { ...base, planData: null, userProfile: { health_profile: { age: 30 }, plan_mode: 'tracking' } });
        expect(screen.getByText('GENERANDO')).toBeInTheDocument();
    });
});

describe('lote 137 · el contador no depende del plan ni de un perfil lento', () => {
    it('sin perfil leído, el espejo local «contador» acredita el formulario: no se le echa al wizard', () => {
        window.localStorage.setItem('mealfit_plan_mode', 'tracking');
        montar(['/dashboard'], { ...base, planData: null, userProfile: null });
        expect(screen.getByText('PANEL')).toBeInTheDocument();
    });

    it('sin espejo y sin perfil sigue siendo una cuenta nueva ⇒ formulario', () => {
        montar(['/dashboard'], { ...base, planData: null, userProfile: null });
        expect(screen.getByText(/FORMULARIO/)).toBeInTheDocument();
    });

    it('con perfil en mano manda el perfil, no el espejo (cuenta B en el dispositivo de A)', () => {
        window.localStorage.setItem('mealfit_plan_mode', 'tracking');
        montar(['/dashboard'], { ...base, planData: null, userProfile: { health_profile: {} } });
        expect(screen.getByText(/FORMULARIO/)).toBeInTheDocument();
    });

    it('el Dashboard decide el MODO antes que la pantalla de «no pudimos sincronizar tu plan»', () => {
        const d = leer('src/pages/Dashboard.jsx');
        const w = d.slice(d.lastIndexOf('const Dashboard = () => {'));
        expect(w.indexOf("const _planMode = userProfile?.plan_mode || safeLocalStorageGet('mealfit_plan_mode', null) || null;"))
            .toBeLessThan(w.indexOf('if (loadingData) {'));
        expect(w).toContain("if (!planData && planSyncFailed && _planMode !== 'tracking') {");
        expect(w).toContain("_planMode === 'tracking' ? t('Cargando tu progreso...') : t('Sincronizando tu plan...')");
    });

    it('el espejo del modo se siembra desde el perfil y muere con la sesión (con la bandera de hidratación)', () => {
        const c = leer('src/context/AssessmentContext.jsx');
        const limpia = c.slice(c.indexOf('const _clearUserScopedCaches = () => {'), c.indexOf('// [P1-PLANDATA-ID-HYDRATE-2'));
        for (const k of ['mealfit_plan_mode', 'mealfit_water_tracker_enabled', 'mealfit_water_auto_off_visto']) {
            expect(limpia).toContain(`safeLocalStorageRemove('${k}');`);
        }
        expect(c).toMatch(/setUserProfile\(data\);[\s\S]{0,700}if \(data\.plan_mode === 'tracking' \|\| data\.plan_mode === 'plan'\) \{\s*safeLocalStorageSet\('mealfit_plan_mode', data\.plan_mode\);/);
    });
});

describe('lote 137 · rutas «de plan» por URL en modo contador', () => {
    it('Progreso y Recetas devuelven al contador (contador manda)', () => {
        const p = leer('src/pages/ProgressPage.jsx');
        expect(p).toContain('if (isTrackingMode(userProfile)) return <Navigate to="/dashboard" replace />;');
        const r = leer('src/pages/Recipes.jsx');
        const i = r.indexOf('if (isTrackingMode(userProfile)) {');
        expect(i).toBeGreaterThan(-1);
        // ANTES del rebote sin plan, que mandaba a un contador al formulario
        expect(i).toBeLessThan(r.indexOf('return <Navigate to="/assessment" replace />;'));
        expect(r.slice(i, i + 120)).toContain('<Navigate to="/dashboard" replace />');
    });

    it('la campana (avisos que solo produce el dashboard del plan) no se monta en contador, ni su hueco', () => {
        const l = leer('src/components/dashboard/DashboardLayout.jsx');
        expect(l).toMatch(/const showNotifCenter = location\.pathname\.replace\(\/\\\/\$\/, ''\) === '\/dashboard'\s*&& !isTrackingMode\(userProfile, planData\);/);
        expect(l).toContain('{showNotifCenter && <NotificationSlot />}');
    });

    it('el título de la pestaña del navegador dice «Progreso», no «Mi plan»', () => {
        const t = leer('src/components/layout/RouteTitle.jsx');
        expect(t).toContain("(path === '/dashboard' && isTrackingMode(null))");
    });
});

describe('lote 137 · Historial con el generador apagado', () => {
    const h = leer('src/pages/History.jsx');

    it('el plan ACTUAL en pausa ofrece «Reanudar el plan» (lo prometen Configuración, la tarjeta y el coach)', () => {
        const i = h.lastIndexOf('const _hideRestore = ');
        const pie = h.slice(i, i + 1300);
        expect(pie).toContain('if (!enModoContador || _selectedIsPlaceholder) return null;');
        expect(pie).toContain('<button onClick={reanudarPlanes} className={styles.modalActionBtn}>');
        expect(pie).toContain("{t('Reanudar el plan')}");
    });

    it('«Reactivar» un plan viejo ENCIENDE la generación, y el confirm lo avisa', () => {
        const i = h.indexOf('const handleRestoreConfirm = async () => {');
        const hd = h.slice(i, h.indexOf('const handleDeleteConfirm', i));
        expect(hd).toMatch(/if \(enModoContador\) \{\s*toast\.dismiss\(toastId\);\s*navigate\('\/dashboard'\);\s*await reanudarTrasReactivar\(\);\s*return;\s*\}/);
        // …y solo tras un restore que NO falló
        expect(hd.indexOf('result.success === false')).toBeLessThan(hd.indexOf('if (enModoContador) {'));
        expect(h).toContain("{enModoContador && <>{t('Tienes la generación de planes apagada: reactivar este plan la vuelve a encender.')}{' '}</>}");
    });

    it('los dos exports de reanudar siguen SIN parámetros (van directos a un onClick: recibirían el evento)', () => {
        const r = leer('src/utils/planModeResume.js');
        expect(r).toContain('export const reanudarPlanes = () => _reanudar();');
        expect(r).toContain('export const reanudarTrasReactivar = () => _reanudar({');
        expect(r).toContain('const _reanudar = async ({ exito } = {}) => {');
        expect((r.match(/\/api\/profile\/plan-mode/g) || []).length).toBe(1);
    });
});

describe('lote 137 · el Agente', () => {
    it('TODA entrada de su menú trae icono, en los dos modos (en modo plan «Progreso» llegaba con undefined y React reventaba)', () => {
        for (const contador of [false, true]) {
            const items = menuItemsDelAgente(contador);
            expect(items.length).toBe(navItemsFor({ trackingMode: contador }).length);   // −Agente +Configuración
            for (const it of items) {
                expect(it.icon, `${it.label} (${contador ? 'contador' : 'plan'})`).toBeTruthy();
            }
        }
        expect(leer('src/pages/AgentPage.jsx')).toContain('icon: iconoPorKey[i.key] ?? LayoutDashboard');
    });

    it('los atajos del teléfono y las píldoras del estado vacío son los del contador', () => {
        const a = leer('src/pages/AgentPage.jsx');
        expect(a).toContain("? [t('¿Qué me falta hoy?'), t('Registrar lo que comí'), t('Proponme una comida')]");
        expect(a).toContain(": [t('¿Qué me toca ahora?'), t('Registrar lo que comí'), t('Cambiar un plato')]).map((texto) => (");
        expect(a).toContain("? [{ icon: '💪', text: t('¿Cuánta proteína me falta hoy?') },");
    });

    it('el widget de ayuda no sugiere «cambiar un plato del día» a quien no tiene plan', () => {
        const w = leer('src/components/dashboard/HelpChatWidget.jsx');
        expect(w).toContain("if (contador) return [t('¿Cómo registro lo que como?'), ...base];");
        expect(w).toContain('getSuggestions(t, isTrackingMode(null))');
    });
});

describe('lote 137 · formulario y Nevera', () => {
    it('el formulario ofrece «Volver al panel» al usuario contador, también en el paso 0 del teléfono', () => {
        const f = leer('src/components/assessment/InteractiveAssessmentLayout.jsx');
        expect(f).toContain('const _contadorConPanel = !isGuest && isTrackingMode(userProfile)');
        expect(f).toContain("if (_contadorConPanel) updateData('appMode', 'tracking');");
        expect((f.match(/onClick=\{volverAlPanel\}/g) || []).length).toBe(2);
        // en el paso 0 la salida destructiva (cerrar sesión) queda SOLO para quien no tiene panel
        expect(f).toMatch(/\) : _puedeVolverAlPanel \? \([\s\S]{0,500}onClick=\{volverAlPanel\}/);
    });

    it('Nevera de escritorio: vacía ≠ baja, y sin nada que vaciar no hay botón de vaciar (paridad con el teléfono)', () => {
        const p = leer('src/pages/Pantry.jsx');
        expect((p.match(/\{pantryStatus\?\.is_below && !neveraVacia && \(/g) || []).length).toBe(2);
        expect(p).not.toMatch(/\{pantryStatus\?\.is_below && \(/);
        expect(p).toMatch(/\{!neveraVacia && \(\s*<button\s*type="button"\s*className=\{`\$\{fstyles\.btn\} \$\{fstyles\.clear\} \$\{fstyles\.iconbtn\}`\}/);
    });
});
