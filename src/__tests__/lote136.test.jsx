// [P1-PLAN-LOTE-136 · 2026-09-20] Configuración con el generador de planes APAGADO: sin contradicciones.
//
// El dueño: «revisa en general el apartado de configuración cuando el generador de planes está apagado: ¿funciona todo al
// 100 %, listo para producción? ¿No hay ninguna contradicción?». Auditoría de la pantalla y del servidor: no había caídas
// ni cobros indebidos, pero sí nueve contradicciones. Cada bloque de aquí es una de ellas.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import PlanObjetivo from '../components/settings/PlanObjetivo';

const leer = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8').replace(/\r\n/g, '\n');
const st = leer('src/pages/Settings.jsx');

describe('lote 136 · lo que en modo contador no hace nada, no se pinta', () => {
    it('«Modo automático» solo existe con el generador encendido (su único lector es el worker de bloques del plan)', () => {
        const i = st.indexOf("{t('Modo automático')}");
        expect(i).toBeGreaterThan(-1);
        const antes = st.slice(i - 1400, i);
        expect(antes).toContain('{!enModoContador && (');
        // y la descripción de la sección deja de anunciarlo
        expect(st).toContain("isTrackingMode(userProfile) ? t('Generador de planes, memoria y datos del agente') : t('Modo automático, memoria y datos del agente')");
    });
});

describe('lote 136 · Plan & Objetivo: contador manda, con o sin plan en pausa', () => {
    it('las metas salen de /api/nutrition/targets en modo contador aunque haya un plan pausado, y siguen a «Guardar»', () => {
        expect(st).toContain('if ((planData && !enModoContador) || isGuest) return undefined;');
        expect(st).toContain("window.addEventListener('mealfit:targets-changed', pedir);");
        expect(st).toContain('const _goalKcal = (planData?.calories && !enModoContador)');
        expect(st).toContain('if ((!planData || enModoContador) && trackingTargets?.ok) {');
        // la lectura del modo vive ANTES del efecto que la usa (en el array de dependencias, después sería un TDZ)
        expect(st.indexOf('const enModoContador = isTrackingMode(userProfile);')).toBeLessThan(st.indexOf("fetchWithAuth('/api/nutrition/targets')"));
        expect(st.split('const enModoContador = isTrackingMode(userProfile);').length - 1).toBe(1);
    });

    it('con un plan en pausa el botón REANUDA (gratis): ni «Evaluar de nuevo» ni «sin créditos»', () => {
        expect(st.split('if (enModoContador && planData) { reanudarPlanes(); return; }').length - 1).toBe(2);   // móvil + escritorio
        expect(st).toContain("import { reanudarPlanes } from '../utils/planModeResume';");
        expect(st.split('planData && isLimitReached && !enModoContador ? renderPlanLimitBlock()').length - 1).toBe(2);
        expect(st).toContain("(enModoContador ? t('Reanudar el plan') : t('Evaluar de nuevo'))");
        // y el wizard entra por SU rama: la puerta la declara
        expect(st.split("if (enModoContador) updateData('appMode', 'tracking');").length - 1).toBe(2);
    });

    it('sin metas todavía la pantalla móvil pinta «—», no «0 kcal · 0 g»', () => {
        const { unmount } = render(<PlanObjetivo goal="Perder grasa" kcal={null} macros={null} topBar={false} backButton={false} />);
        expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(4);   // kcal + 3 macros
        expect(screen.queryByText('0g')).toBeNull();
        unmount();
        render(<PlanObjetivo goal="Perder grasa" kcal={2050} macros={{ protein: 134, carbs: 251, fat: 57 }} topBar={false} backButton={false} />);
        expect(screen.getByText('134g')).toBeTruthy();
        expect(st).toContain('macros={_goalKcal === null ? null : _dailyMacros}');
        expect(st).not.toContain('kcal={_goalKcal || 0}');
    });
});

describe('lote 136 · el interruptor del generador', () => {
    const h = st.slice(st.indexOf('const handleTogglePlanMode'), st.indexOf('const handleTogglePlanMode') + 6500);

    it('no promete «tu plan queda en el Historial» a quien nunca tuvo plan', () => {
        expect(h).toMatch(/description: planData\s*\? t\('La app pasa a modo contador \(macros y diario\)\. Tu plan no se pierde/);
        expect(h).toContain("t('La app pasa a modo contador (macros y diario). Puedes volver a encender la generación cuando quieras.')");
        expect(st).toContain("t('Apagada. La app funciona como contador; enciéndela cuando quieras que la IA te arme un plan.')");
    });

    it('manda lo que CONTESTA el servidor: con el interruptor operativo apagado no se pinta una pausa que no ocurrió', () => {
        expect(h).toContain("const quedo = (data.plan_mode === 'plan' || data.plan_mode === 'tracking') ? data.plan_mode : next;");
        expect(h).toMatch(/if \(quedo !== next\) \{\s*setPlanModeState\(quedo\);\s*toast\.error\(/);
        // el espejo local solo se escribe DESPUÉS de esa comprobación
        expect(h.indexOf('if (quedo !== next) {')).toBeLessThan(h.indexOf("safeLocalStorageSet('mealfit_plan_mode', next);"));
    });

    it('sin plan no hay recarga: el perfil en memoria se refresca para que el resto de la pantalla cambie de modo', () => {
        expect(h).toMatch(/if \(planData\) \{\s*setTimeout\(\(\) => window\.location\.reload\(\), 900\);\s*\} else \{[\s\S]{0,700}await refreshProfileAndPlan\(\);/);
        expect(h).toContain("if (!pausing) updateData('appMode', 'plan');");
    });

    it('si no se puede leer el modo, el interruptor no desaparece en silencio: reintenta y lo dice', () => {
        expect(st).toContain('const [planModeLoadFailed, setPlanModeLoadFailed] = useState(false);');
        expect(st).toContain('for (let intento = 0; intento < 2; intento += 1) {');
        expect(st).toContain('{!isGuest && planModeState === null && planModeLoadFailed && (');
        expect(st).toContain('onClick={cargarPlanMode}');
    });
});

describe('lote 136 · guardar y salir en modo contador', () => {
    it('«Guardar» no escribe el formulario entero (campos nunca preguntados, appMode) en health_profile', () => {
        const g = st.slice(st.indexOf('const handleSaveTracking = async () => {'), st.indexOf('const handleUpdatePlanWithMetrics = async () => {'));
        expect(g).toContain('const hp = Object.keys(overrides).length ? { ...(userProfile?.health_profile || {}), ...overrides } : null;');
        expect(g).not.toContain('buildHealthProfilePayload(formData, overrides, session)');
    });

    it('el aviso de salir sin guardar no habla de un plan que no hay', () => {
        expect(st).toContain("t('Editaste tu peso o altura pero no guardaste los cambios. Si sales ahora, los nuevos valores se')");
    });

    it('los textos nuevos están en los cuatro catálogos', () => {
        for (const loc of ['en-US', 'pt-BR', 'fr-FR', 'it-IT']) {
            const cat = JSON.parse(leer(`src/i18n/locales/${loc}.json`));
            for (const k of [
                'Generación apagada. La app queda como contador; enciéndela cuando quieras.',
                'Gestiona tu cuenta, tus metas y preferencias.',
                'Se aplicará al catálogo de alimentos de tu diario.',
                'No pudimos leer si está encendida. Revisa tu conexión y vuelve a intentarlo.',
            ]) expect(cat[k], `${loc}: ${k}`).toBeTruthy();
        }
    });
});
