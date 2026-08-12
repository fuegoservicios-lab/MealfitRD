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

    it('isTrackingMode: un plan vivo SIEMPRE gana (nav completa)', () => {
        expect(isTrackingMode({ plan_mode: 'tracking' }, { days: [] })).toBe(false);
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

    it('QPlanSource es obligatoria: fields declarados + contrato + asterisco', () => {
        // [P1-PLANSOURCE-REQUIRED · 2026-08-12] Decisión del owner que anula el
        // «default scratch silencioso» de P1-PANTRY-FIRST-PLAN. Tres piezas o
        // ninguna: sin `fields` el botón aparece solo; sin el contrato, saltar
        // la ignora; sin asterisco, el usuario no sabe que es obligatoria.
        expect(REQUIRED_FORM_FIELDS[0]).toBe('planSource');
        const s = read('components/assessment/InteractiveAssessmentFlow.jsx');
        const stepIdx = s.indexOf('¿Cómo quieres que la IA arme tu plan?');
        expect(stepIdx).toBeGreaterThan(-1);
        const bloque = s.slice(stepIdx, stepIdx + 700);
        expect(bloque).toContain("fields: ['planSource']");
        expect(s.slice(stepIdx - 50, stepIdx + 120)).toContain("<span style={{ color: '#EF4444' }}>*</span>");
    });

    it('Wizard: al cambiar de rama se tira TAMBIÉN maxReachedStep (no solo currentStep)', () => {
        // [P1-WIZARD-MAXSTEP-BRANCH · 2026-08-12] canSkip = currentStep < maxReachedStep;
        // heredar el máximo de la OTRA rama hacía canSkip=true en pasos jamás
        // visitados: «Siguiente Paso» visible con preguntas obligatorias sin
        // contestar (el horario cotidiano se saltaba en la práctica). Un índice
        // máximo solo significa algo en el array donde se alcanzó.
        const s = read('components/assessment/InteractiveAssessmentFlow.jsx');
        const stampIdx = s.indexOf("localStorage.setItem('mealfit_wizard_step_mode'");
        expect(stampIdx).toBeGreaterThan(-1);
        const bloque = s.slice(stampIdx, stampIdx + 1400);
        expect(bloque).toContain('setCurrentStep(Math.min(1, steps.length - 1))');
        expect(bloque).toContain('setMaxReachedStep(Math.min(1, steps.length - 1))');
    });

    it('Wizard: bifurcación por modo con la firma de forma como dep del memo', () => {
        const s = read('components/assessment/InteractiveAssessmentFlow.jsx');
        expect(s).toContain('const steps = _isTracking ? _trackingSteps : [_appModeStep, ...planOnlySteps];');
        // la dep del memo es la FIRMA (cambia cuando cambia qué campo vive en qué paso)
        expect(s).toContain('const stepsShape = steps.map((st) => (st.fields || []).join');
        expect(s).toContain('useMemo(() => buildFieldToStepIndex(steps), [stepsShape])');
        // trampa 2: el índice persistido se tira al cambiar de modo
        expect(s).toContain("localStorage.getItem('mealfit_wizard_step_mode')");
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
});
