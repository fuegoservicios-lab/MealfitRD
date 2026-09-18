// [P1-PLAN-LOTE-102 · 2026-09-18] Cuatro cosas del dueño tras probar el 101 en el iPhone:
//  · un solo icono de cámara en «Escanear comida» (se va el del título, queda el de «Usar la cámara»);
//  · la pestaña del contador se llama «Progreso» (no «Hoy») y la sección «Tus macros y micros de hoy» (no «Progreso en
//    Tiempo Real») — y el coach y el aviso «Bórralo en «…»» nombran la sección como el usuario la VE;
//  · en modo contador, Configuración guarda peso/altura/edad/sexo al momento (sin regenerar ni gastar crédito) y
//    avisa a la pantalla de progreso para que vuelva a pedir las metas.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');

describe('un solo icono de cámara', () => {
    it('el título de «Escanear comida» ya no lleva tile con cámara', () => {
        const jsx = src('src/components/dashboard/ScanMealModal.jsx');
        const i = jsx.indexOf('id="scan-meal-title"');
        expect(jsx.slice(i, i + 200)).not.toContain('titleIco');
        expect(jsx.slice(i, i + 200)).not.toContain('<Camera');
        // el de «Usar la cámara» sigue
        expect(jsx).toContain("t('Usar la cámara')");
    });
});

describe('los nombres que ve el usuario', () => {
    it('pestaña «Progreso» en modo contador, sección «Tus macros y micros de hoy», y el aviso y el coach dicen lo mismo', () => {
        expect(src('src/config/dashboardNav.js')).toContain("trackingMode ? t('Progreso') : t('Plan|nav')");
        expect(src('src/components/dashboard/TrackingProgress.jsx')).toContain("t('Tus macros y micros de hoy')");
        expect(src('src/utils/todayRemaining.js')).toContain("const seccion = t('Tus macros y micros de hoy');");
        for (const f of ['src/components/dashboard/TrackingProgress.jsx', 'src/utils/todayRemaining.js', 'src/config/dashboardNav.js']) {
            const code = src(f).split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
            expect(code, f).not.toContain("t('Progreso en Tiempo Real')");
        }
    });
});

describe('modo contador: peso y altura en tiempo real', () => {
    it('Configuración guarda al momento, sin regenerar, y avisa con mealfit:targets-changed', () => {
        const s = src('src/pages/Settings.jsx');
        expect(s).toContain("import { isTrackingMode } from '../config/dashboardNav';");
        expect(s).toContain('const enModoContador = isTrackingMode(userProfile);');
        expect(s).toContain('const handleSaveTracking = async () => {');
        const h = s.slice(s.indexOf('const handleSaveTracking = async () => {'), s.indexOf('const handleUpdatePlanWithMetrics = async () => {'));
        expect(h).not.toContain('regeneratePlan(');
        expect(h).not.toContain('getFreshPlanCount(');
        expect(h).toContain("window.dispatchEvent(new Event('mealfit:targets-changed'));");
        expect(h).toContain('buildHealthProfilePayload(formData, overrides, session)');
        // el aviso de «debes regenerar el plan» no aplica sin plan, y el botón es «Guardar»
        expect(s).toContain('{bodyMetricsChanged && !enModoContador && (');
        expect(s).toContain('{enModoContador ? (');
    });

    it('la pantalla de progreso vuelve a pedir las metas al recibir el aviso', () => {
        const s = src('src/components/dashboard/DashboardTracking.jsx');
        expect(s).toContain("window.addEventListener('mealfit:targets-changed', cargar);");
        expect(s).toContain("window.removeEventListener('mealfit:targets-changed', cargar);");
    });
});
