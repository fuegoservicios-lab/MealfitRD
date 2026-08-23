/* [P1-PLAN-MODE · 2026-08-11] Contrato frontend del modo seguimiento (Fase 2).
 *
 * Dos familias:
 *   A) Comportamiento puro — dashboardNav (SSOT de la nav por modo) y
 *      formValidation (la rama corta del wizard) se importan y se ejecutan.
 *   B) Anclas parser-based sobre los archivos tocados — cada ancla afirma
 *      primero que EXISTE (un guard que ya no puede fallar es peor que no
 *      tenerlo) y después la propiedad que protege.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { render, screen } from './utils/test-utils';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from '../components/layout/ProtectedRoute';
import { navItemsFor, isTrackingMode } from '../config/dashboardNav';
import { TRACKING_REQUIRED_FIELDS, missingPlanFields, REQUIRED_FORM_FIELDS } from '../config/formValidation';

const SRC = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');

/* ═══ A1. dashboardNav: el SSOT decide, los consumidores solo pegan iconos ═══ */
describe('[P1-PLAN-MODE] dashboardNav — SSOT de la nav por modo', () => {
    it('modo plan: 5 entradas, Recetas presente, rótulo Plan', () => {
        const items = navItemsFor({ trackingMode: false });
        expect(items.map((i) => i.key)).toEqual(['plan', 'agent', 'pantry', 'recipes', 'history']);
        expect(items[0].label).toBe('Plan');
    });

    it('modo seguimiento: Recetas se OCULTA y Plan se rotula Hoy', () => {
        const items = navItemsFor({ trackingMode: true });
        expect(items.map((i) => i.key)).toEqual(['plan', 'agent', 'pantry', 'history']);
        expect(items[0].label).toBe('Hoy');
        expect(items[0].path).toBe('/dashboard'); // mismo destino, otro rótulo
    });

    // [P1-TRACKING-WINS · 2026-08-14] CONTRATO INVERTIDO por decisión del owner.
    // El anterior («un plan vivo SIEMPRE gana») nació como fail-open contra flags
    // stale, pero de paso hacía IMPOSIBLE la promesa de la otra puerta: el owner
    // entró por el wizard diciendo «quiero usar la app solo como contador» y
    // aterrizó en el dashboard del plan con una notita de pausa. Elegido:
    // «contador manda» — una elección EXPLÍCITA de tracking gana, con o sin plan
    // pausado (el plan queda en Historial con Reanudar). El fail-open sobrevive
    // donde tenía sentido: modo DESCONOCIDO + plan vivo = nav completa.
    it('isTrackingMode: la elección EXPLÍCITA de tracking gana, con o sin plan', () => {
        expect(isTrackingMode({ plan_mode: 'tracking' }, { days: [] })).toBe(true);
        expect(isTrackingMode({ plan_mode: 'tracking' }, null)).toBe(true);
    });

    it('isTrackingMode: modo DESCONOCIDO + plan vivo = nav completa (el fail-open original)', () => {
        localStorage.removeItem('mealfit_plan_mode');
        expect(isTrackingMode(null, { days: [] })).toBe(false);
        expect(isTrackingMode({}, { days: [] })).toBe(false);
    });

    it('isTrackingMode: plan_mode=plan explícito nunca es tracking', () => {
        expect(isTrackingMode({ plan_mode: 'plan' }, { days: [] })).toBe(false);
        expect(isTrackingMode({ plan_mode: 'plan' }, null)).toBe(false);
    });

    it('el wrapper del Dashboard evalúa el MODO antes que planData', () => {
        // [P1-TRACKING-WINS] El bug reportado vivía en el orden: con
        // `if (!planData)` primero, un plan pausado en memoria te clavaba en
        // DashboardInner aunque el modo fuera tracking. El contador debe
        // decidirse ANTES de mirar si hay plan.
        const s = read('pages/Dashboard.jsx');
        const iTracking = s.lastIndexOf("if (_planMode === 'tracking')");
        const iNoPlan = s.lastIndexOf('if (!planData) {');
        const iInner = s.lastIndexOf('return <DashboardInner />');
        expect(iTracking, 'no se encontró la rama tracking del wrapper').toBeGreaterThan(-1);
        expect(iTracking, 'el modo debe evaluarse ANTES del check de planData')
            .toBeLessThan(iNoPlan);
        expect(iNoPlan).toBeLessThan(iInner);
    });

    it('isTrackingMode: perfil primero, espejo localStorage después', () => {
        localStorage.removeItem('mealfit_plan_mode');
        expect(isTrackingMode({ plan_mode: 'tracking' }, null)).toBe(true);
        expect(isTrackingMode({ plan_mode: 'plan' }, null)).toBe(false);
        // perfil aún no cargado → decide el espejo
        localStorage.setItem('mealfit_plan_mode', 'tracking');
        expect(isTrackingMode(null, null)).toBe(true);
        // «no sé» (ni perfil ni espejo) jamás se trata como tracking
        localStorage.removeItem('mealfit_plan_mode');
        expect(isTrackingMode(null, null)).toBe(false);
    });
});

/* ═══ A2. formValidation: la rama corta pregunta lo que el contador necesita ═══ */
describe('[P1-PLAN-MODE] formValidation — contrato de la rama corta', () => {
    it('TRACKING_REQUIRED_FIELDS: los 10 campos del contador/seguridad, sin campos de plan', () => {
        // Los que alimentan get_nutrition_targets o son seguridad clínica.
        for (const f of ['gender', 'age', 'height', 'weight', 'weightUnit', 'activityLevel', 'mainGoal', 'dietType', 'allergies', 'medicalConditions']) {
            expect(TRACKING_REQUIRED_FIELDS, `falta ${f}`).toContain(f);
        }
        // Y NINGUNO exclusivo del plan (cocina/compras no alimentan el contador).
        for (const f of ['mealsPerDay', 'cookingTime', 'budget', 'groceryDuration']) {
            expect(TRACKING_REQUIRED_FIELDS, `${f} sobra en tracking`).not.toContain(f);
        }
    });

    it('missingPlanFields cuenta contra el contrato de PLAN, no el de tracking', () => {
        expect(missingPlanFields({}).length).toBe(REQUIRED_FORM_FIELDS.length);
        // un formulario de tracking completo aún debe MISSING los campos de plan
        const trackingDone = Object.fromEntries(TRACKING_REQUIRED_FIELDS.map((f) => [f, 'x']));
        const faltan = missingPlanFields(trackingDone);
        expect(faltan.length).toBeGreaterThan(0);
        expect(faltan).not.toContain('gender');
    });
});

/* ═══ A3. ProtectedRoute: usuario tracking con assessment hecho va al dashboard ═══ */
describe('[P1-PLAN-MODE] ProtectedRoute — landing POP en modo seguimiento', () => {
    const renderLanding = (customContext) =>
        render(
            <Routes>
                <Route path="/" element={<ProtectedRoute><div>LANDING</div></ProtectedRoute>} />
                <Route path="/dashboard" element={<div>DASHBOARD</div>} />
                <Route path="/assessment" element={<div>ASSESSMENT</div>} />
            </Routes>,
            {
                customContext,
                wrapper: ({ children }) => (
                    <MemoryRouter initialEntries={['/']}>{children}</MemoryRouter>
                ),
            }
        );

    const base = {
        session: { user: { id: 'u1' } },
        loadingAuth: false,
        loadingData: false,
        loadingProfile: false,
        isGuest: false,
        planData: null,
    };

    beforeEach(() => {
        localStorage.removeItem('mealfit_plan_mode');
        localStorage.removeItem('mealfit_plan_in_progress');
    });

    it('perfil tracking + assessment hecho + sin plan → DASHBOARD (no re-formulario)', () => {
        renderLanding({
            ...base,
            userProfile: { id: 'u1', plan_mode: 'tracking', health_profile: { age: 30 } },
        });
        expect(screen.getByText('DASHBOARD')).toBeInTheDocument();
    });

    it('espejo localStorage=tracking cubre el cold-start con perfil rezagado', () => {
        localStorage.setItem('mealfit_plan_mode', 'tracking');
        renderLanding({
            ...base,
            userProfile: { id: 'u1', health_profile: { age: 30 } },
        });
        expect(screen.getByText('DASHBOARD')).toBeInTheDocument();
    });

    it('modo plan sin plan generado conserva el destino previo: ASSESSMENT', () => {
        renderLanding({
            ...base,
            userProfile: { id: 'u1', plan_mode: 'plan', health_profile: { age: 30 } },
        });
        expect(screen.getByText('ASSESSMENT')).toBeInTheDocument();
    });
});

/* ═══ B. Anclas parser-based sobre los archivos tocados ═══ */
describe('[P1-PLAN-MODE] anclas de los archivos tocados', () => {
    it('Dashboard: la bandera de pausa deriva del generation_status y gobierna franja + 2 CTAs', () => {
        const s = read('pages/Dashboard.jsx');
        // 1. la bandera existe y deriva de la fuente correcta
        expect(s).toContain("const isPlanPaused = planData?.generation_status === 'paused_by_user';");
        // 2. la franja existe y ofrece reanudar en sitio
        expect(s).toContain('Planes en pausa.');
        expect(s).toContain('Reanudar planes');
        // 3. gate del CTA que encola trabajo (el IIFE de Actualizar platos)
        expect(s).toContain('{!isPlanPaused && (() => {');
        // 4. gate del refresco de próximos días — el comentario del bloque va
        //    primero y la condición unas líneas DESPUÉS: ventana hacia adelante.
        const refr = s.indexOf('Refrescar próximos días');
        expect(refr).toBeGreaterThan(-1);
        const ventana = s.slice(refr, refr + 1200);
        expect(ventana).toContain('&& !isPlanPaused');
    });

    it('DashboardLayout y BottomTabBar consumen el SSOT (cero copias a mano de la nav)', () => {
        for (const rel of ['components/dashboard/DashboardLayout.jsx', 'components/dashboard/BottomTabBar.jsx']) {
            const s = read(rel);
            expect(s, rel).toContain("from '../../config/dashboardNav'");
            expect(s, rel).toContain('navItemsFor({ trackingMode: isTrackingMode(userProfile, planData) })');
            // la copia vieja murió: nadie declara label Recetas con path inline
            expect(s, rel).not.toContain("label: 'Recetas', path: '/dashboard/recipes'");
        }
    });

    it('Settings: card de Generación de planes con confirmación SOLO al pausar', () => {
        const s = read('pages/Settings.jsx');
        expect(s).toContain('Generación de planes');
        expect(s).toContain("fetchWithAuth('/api/profile/plan-mode'");
        // la confirmación vive dentro de la rama `pausing` (reanudar no confirma)
        const h = s.indexOf('const handleTogglePlanMode');
        expect(h).toBeGreaterThan(-1);
        const cuerpo = s.slice(h, h + 3000);
        expect(cuerpo).toContain("const pausing = planModeState === 'plan';");
        expect(cuerpo).toMatch(/if \(pausing\) \{[\s\S]{0,400}confirmToast\(/);
        // espejo localStorage tras el PUT (wrapper de la casa, no raw)
        expect(cuerpo).toContain("safeLocalStorageSet('mealfit_plan_mode', next)");
    });

    it('History: bucket paused ANTES de partial y excluido de la elevación por counters', () => {
        const s = read('pages/History.jsx');
        const pausedIdx = s.indexOf("if (rawStatus === 'paused_by_user') {");
        const partialIdx = s.indexOf("rawStatus === 'partial' ||");
        expect(pausedIdx).toBeGreaterThan(-1);
        expect(partialIdx).toBeGreaterThan(-1);
        expect(pausedIdx).toBeLessThan(partialIdx);
        expect(s).toContain("bucket !== 'failed' && bucket !== 'action_required' && bucket !== 'paused'");
    });

    it('QAppMode y QPlanSource son obligatorias: fields + contrato + asterisco', () => {
        // [P1-PLANSOURCE-REQUIRED + P1-APPMODE-REQUIRED · 2026-08-12] Decisión del
        // owner. Tres piezas o ninguna por pregunta: sin `fields` el botón aparece
        // solo; sin el contrato, saltar la ignora para usuarios que regresan; sin
        // asterisco, el usuario no sabe que es obligatoria. El orden del contrato
        // es el de los pasos (findFirstIncompleteField navega en ese orden).
        expect(REQUIRED_FORM_FIELDS[0]).toBe('appMode');
        expect(REQUIRED_FORM_FIELDS[1]).toBe('planSource');
        const s = read('components/assessment/InteractiveAssessmentFlow.jsx');
        for (const [titulo, campo] of [
            ['¿Qué quieres que haga {app} por ti?', 'appMode'],  // [P3-I18N-MARCA-HORNEADA] la marca va como {app}
            ['¿Cómo quieres que la IA arme tu plan?', 'planSource'],
        ]) {
            const stepIdx = s.indexOf(titulo);
            expect(stepIdx, titulo).toBeGreaterThan(-1);
            expect(s.slice(stepIdx - 50, stepIdx + 150), titulo).toContain("<span style={{ color: '#EF4444' }}>*</span>");
            expect(s.slice(stepIdx, stepIdx + 700), titulo).toContain(`fields: ['${campo}']`);
        }
        // appMode NO entra al contrato de tracking: la rama corta solo existe con
        // appMode ya contestado, y QTrackingFinish persiste esa lista al
        // health_profile — meterlo ahí contaminaría el jsonb con ruteo del wizard.
        expect(TRACKING_REQUIRED_FIELDS).not.toContain('appMode');
    });

    it('Wizard: al cambiar de rama se tira TAMBIÉN maxReachedStep (no solo currentStep)', () => {
        // [P1-WIZARD-MAXSTEP-BRANCH · 2026-08-12] canSkip = currentStep < maxReachedStep;
        // heredar el máximo de la OTRA rama hacía canSkip=true en pasos jamás
        // visitados: «Siguiente Paso» visible con preguntas obligatorias sin
        // contestar (el horario cotidiano se saltaba en la práctica). Un índice
        // máximo solo significa algo en el array donde se alcanzó.
        const s = read('components/assessment/InteractiveAssessmentFlow.jsx');
        const stampIdx = s.indexOf("safeLocalStorageSet('mealfit_wizard_step_mode'");
        expect(stampIdx).toBeGreaterThan(-1);
        const bloque = s.slice(stampIdx, stampIdx + 2200);
        // [P1-MAXSTEP-LANDING-PARITY] el máximo aterriza DONDE aterriza el paso
        // (0 si currentStep era 0): un max=1 fijo encendía canSkip en el paso 0.
        expect(bloque).toContain('const _landing = currentStep > 0 ? Math.min(1, steps.length - 1) : 0;');
        expect(bloque).toContain('setCurrentStep(_landing)');
        expect(bloque).toContain('setMaxReachedStep(_landing)');
    });

    it('Wizard: bifurcación por modo con la firma de forma como dep del memo', () => {
        const s = read('components/assessment/InteractiveAssessmentFlow.jsx');
        expect(s).toContain('const steps = _isTracking ? _trackingSteps : [_appModeStep, ...planOnlySteps];');
        // la dep del memo es la FIRMA (cambia cuando cambia qué campo vive en qué paso)
        expect(s).toContain('const stepsShape = steps.map((st) => (st.fields || []).join');
        expect(s).toContain('useMemo(() => buildFieldToStepIndex(steps), [stepsShape])');
        // trampa 2: el índice persistido se tira al cambiar de modo
        // [P2-LOCALSTORAGE-SSOT · 2026-08-19] Via el envoltorio unico; lo que se
        // vigila sigue siendo que el indice persistido se LEA para tirarlo al
        // cambiar de modo, no con que funcion se lee.
        expect(s).toContain("safeLocalStorageGet('mealfit_wizard_step_mode', null)");
    });

    it('Wizard: «Saltar a la última pregunta» valida contra el contrato DE LA RAMA', () => {
        // [P1-TRACKING-SKIP-CONTRACT · 2026-08-12] Con el contrato del plan (22
        // campos), en modo contador el salto exigía «Tu horario cotidiano» — un
        // campo cuyo paso NO existe en la rama corta, así que fieldToStepIndex
        // tampoco podía navegar: toast y botón muerto. El fork por modo es el fix;
        // el chequeo de presupuesto (paso del plan) también queda fuera en tracking.
        const s = read('components/assessment/InteractiveAssessmentFlow.jsx');
        expect(s).toContain('? findFirstIncompleteFieldFor(formData, TRACKING_REQUIRED_FIELDS)');
        expect(s).toContain(': findFirstIncompleteField(formData);');
        expect(s).toContain('if (!_isTracking && !isCustomBudgetValid(formData))');
    });

    it('Settings/Plan & Objetivo: sin plan, metas REALES — jamás el 2000 genérico', () => {
        // [P1-SETTINGS-TRACKING-COHERENCE · 2026-08-12] El panel mostraba
        // `planData?.calories || 2000` — un plan genérico disfrazado de meta
        // personal, en la MISMA pantalla donde el contador muestra la real.
        const s = read('pages/Settings.jsx');
        // el fallback 2000 murió de los DOS call sites (móvil + desktop)
        expect(s).not.toContain('|| 2000');
        // la kcal deriva de plan → targets → null ('—'), en ese orden
        expect(s).toContain('trackingTargets?.ok ? Math.round(trackingTargets.calories) : null');
        // y el CTA sin plan actualiza datos (wizard) en vez de abrir el modal de renovar
        expect(s).toContain("if (!planData) { setCurrentStep(1); navigate('/assessment'); return; }");
        expect(s).toContain("'Actualizar mis datos'");
    });

    it('El toggle de Capacidades RECARGA con plan vivo (el servidor cambió, la memoria no)', () => {
        // [P1-PAUSE-STALE-PLANDATA · 2026-08-12] Pausar dejaba el servidor
        // perfecto (flag+paused+cola cancelada) y la pantalla idéntica: el
        // planData en memoria no se rehidrata solo, y refreshProfileAndPlan
        // NO refresca el plan pese al nombre. El reload es el mismo cierre
        // que el botón Reanudar de la franja.
        const s = read('pages/Settings.jsx');
        const h = s.indexOf('const handleTogglePlanMode');
        // Ventana SEMÁNTICA (hasta la siguiente declaración top-level), no un
        // número fijo de caracteres: la de 4200 se desbordó en cuanto un
        // comentario legítimo creció dentro de la función (P1-TRACKING-WINS).
        const fin = s.indexOf('\n    const ', h + 10);
        const cuerpo = s.slice(h, fin > h ? fin : h + 8000);
        const reloadIdx = cuerpo.indexOf('window.location.reload()');
        expect(reloadIdx).toBeGreaterThan(-1);
        expect(cuerpo.slice(Math.max(0, reloadIdx - 300), reloadIdx)).toContain('if (planData)');
    });

    it('Encender el plan cambia la RAMA del wizard antes de navegar (card + toggle)', () => {
        // Sin el flip de appMode, la puerta aterrizaba en «Listo: tu contador»
        // (paso 10 de la rama corta) — prometía encender el plan y te dejaba
        // en el final del modo contador.
        const dt = read('components/dashboard/DashboardTracking.jsx');
        const flipIdx = dt.indexOf("updateData('appMode', 'plan')");
        const navIdx = dt.indexOf("navigate('/assessment')");
        expect(flipIdx).toBeGreaterThan(-1);
        expect(navIdx).toBeGreaterThan(-1);
        expect(flipIdx).toBeLessThan(navIdx);
        const st = read('pages/Settings.jsx');
        expect(st).toContain("if (!pausing && !planData) {");
        const toggleBlock = st.slice(st.indexOf('if (!pausing && !planData) {'), st.indexOf('if (!pausing && !planData) {') + 400);
        expect(toggleBlock).toContain("updateData('appMode', 'plan')");
    });

    it('QTrackingFinish: hidrata el contexto ANTES de navegar (el rebote del botón mudo)', () => {
        // [P1-TRACKING-FINISH-BOUNCE · 2026-08-12] El PATCH escribe health_profile
        // en el servidor pero el userProfile en memoria sigue vacío: sin el
        // refreshProfileAndPlan previo, ProtectedRoute calcula
        // hasCompletedAssessment=false y rebota /dashboard → /assessment en el
        // mismo tick — «Empezar a contar» no hacía nada visible.
        const s = read('components/assessment/questions/QTrackingFinish.jsx');
        const refreshIdx = s.indexOf('await refreshProfileAndPlan()');
        const navIdx = s.indexOf("navigate('/dashboard'");
        expect(refreshIdx).toBeGreaterThan(-1);
        expect(navIdx).toBeGreaterThan(-1);
        expect(refreshIdx).toBeLessThan(navIdx);
    });

    it('DashboardTracking: fail-closed — TrackingProgress SOLO se monta con metas reales', () => {
        const s = read('components/dashboard/DashboardTracking.jsx');
        const mountIdx = s.indexOf('<TrackingProgress');
        expect(mountIdx).toBeGreaterThan(-1);
        // el mount vive dentro de la rama {targets?.ok && (…)}
        const antes = s.slice(Math.max(0, mountIdx - 600), mountIdx);
        expect(antes).toContain('{targets?.ok && (');
        // el descarte de la tarjeta persiste y colapsa a enlace (no borra la puerta)
        expect(s).toContain("_DISMISS_KEY = 'mealfit_turnon_card_dismissed'");
        expect(s).toContain('safeLocalStorageSet(_DISMISS_KEY');
    });

    it('Con plan pausado la tarjeta del contador ofrece REANUDAR, no vender el wizard', () => {
        // [P1-TRACKING-WINS · 2026-08-14] Bajo «contador manda», la nota de pausa
        // de DashboardInner es inalcanzable para usuarios en tracking: esta tarjeta
        // es LA puerta de vuelta. «Encender el plan» cuesta 1 crédito — ofrecérselo
        // a quien ya tiene plan guardado sería cobrarle por lo suyo.
        const s = read('components/dashboard/DashboardTracking.jsx');
        expect(s).toContain('hayPlanPausado={!!planData}');
        const rama = s.indexOf('if (hayPlanPausado)');
        expect(rama).toBeGreaterThan(-1);
        const fin = s.indexOf('// Las cinco reglas', rama);
        const cuerpo = s.slice(rama, fin > rama ? fin : rama + 2000);
        expect(cuerpo).toContain('reanudarPlanes');
        expect(cuerpo).toContain('Reanudar el plan');
        // la rama pausada jamás manda al wizard (irAlPlan = 1 crédito)
        expect(cuerpo).not.toContain('irAlPlan');
    });

    it('Reanudar es UN solo camino: helper compartido, sin PUT inline duplicado', () => {
        // [P1-TRACKING-WINS] El PUT+espejo+reload vivía inline en la nota de pausa;
        // con una 2ª superficie (tarjeta del contador) dos copias drifean — la
        // lección de las 3 tablas de dieta. Ambos call sites importan el helper y
        // el PUT de reanudar existe SOLO en planModeResume.js (Settings conserva su
        // toggle bidireccional propio, que serializa `plan_mode: next`).
        const helper = read('utils/planModeResume.js');
        expect(helper).toContain("JSON.stringify({ plan_mode: 'plan' })");
        // [P2-LOCALSTORAGE-SSOT · 2026-08-19] El espejo local ya no se escribe con
        // `localStorage.setItem` a pelo sino con `safeLocalStorageSet`, que es el
        // envoltorio unico del repo. Lo que este ancla vigila NO cambia: que el
        // espejo se escriba, y que se escriba AQUI y en ningun otro sitio.
        expect(helper).toContain("safeLocalStorageSet('mealfit_plan_mode', 'plan')");
        const dash = read('pages/Dashboard.jsx');
        expect(dash).toContain("from '../utils/planModeResume'");
        expect(dash).not.toContain("JSON.stringify({ plan_mode: 'plan' })");
        const track = read('components/dashboard/DashboardTracking.jsx');
        expect(track).toContain("from '../../utils/planModeResume'");
        expect(track).not.toContain("JSON.stringify({ plan_mode: 'plan' })");
    });
});
