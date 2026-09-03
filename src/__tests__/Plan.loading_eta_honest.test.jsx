// [P2-LOADING-ETA-HONEST · 2026-09-03] La pantalla «Diseñando tu plan» deja de prometer «3-6 minutos»:
// el tiempo lo pone el backend (p50/p90 reales) y el copy es adaptativo; el visual muestra progreso
// real (anillo), los días que se completan (órbita) y las fases (stepper), con reduced-motion.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');
const SRC_ALL = read('src/pages/Plan.jsx');
// Solo CÓDIGO: un literal citado en un comentario no es copy (comentario-vence-guard).
const NL = String.fromCharCode(10);
const SRC = SRC_ALL.split(NL).filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join(NL);
const LOCALES = ['en-US', 'fr-FR', 'it-IT', 'pt-BR'].map((l) => [l, JSON.parse(read(`src/i18n/locales/${l}.json`))]);

describe('LoadingScreen: tiempo honesto', () => {
    it('no queda ninguna cifra fija de minutos en el copy', () => {
        expect(SRC).not.toContain('estimado 3-6');
        expect(SRC).not.toContain('entre 3 y 6 minutos');
        expect(SRC).not.toContain('ya casi terminamos');
        expect(SRC).not.toContain('cerca del final');
    });
    it('lee el p50/p90 real del backend una vez y cae a un rango prudente si no llega', () => {
        expect(SRC).toContain("fetchWithAuth('/api/plans/generation-eta')");
        expect(SRC).toContain("t('Suele tardar entre 5 y 15 minutos según tu perfil y las revisiones del plan.')");
        expect(SRC).toContain("t('Normalmente tarda unos {p50} minutos; 9 de cada 10 planes están listos antes de {p90}.', { p50: etaMin.p50, p90: etaMin.p90 })");
        expect(SRC).toContain("t('Ya pasamos la marca habitual; casi todos los planes terminan antes de {p90} minutos.', { p90: etaMin.p90 })");
        expect(SRC).toContain("t('Está tardando más de lo habitual. Seguimos trabajando en tu plan; puedes salir y te avisamos.')");
        // pasado el p90 el copy cambia de tono (ámbar), no promete «ya casi»
        expect(SRC).toContain('const pastP90 = !!etaMin && elapsedSec >= etaMin.p90 * 60;');
    });
    it('el cronómetro sigue arrancando desde el inicio real del pipeline (P2-LOADING-ETA-57)', () => {
        expect(SRC).toContain("safeLocalStorageGet('mealfit_plan_in_progress', null)");
        expect(SRC).toContain("t('Transcurrido')");
    });
});

describe('LoadingScreen: visual', () => {
    it('anillo de progreso real, órbita de días y stepper de fases', () => {
        expect(SRC).toContain('role="progressbar"');
        expect(SRC).toContain('strokeDasharray={RING_C} strokeDashoffset={ringOffset}');   // arco = progreso real
        expect(SRC).toContain('className="mf-sweep"');                                       // luz que recorre el trazo aunque el % no avance
        expect(SRC).toContain("className={`mf-tick ${k.state === 'done' ? 'is-done' : ''} ${k.state === 'active' ? 'is-active' : ''}`}");   // días integrados en el arco
        expect(SRC).toContain("const state = daysCompleted.includes(d) ? 'done' : (d === activeDay ? 'active' : 'todo');");
        expect(SRC).toContain('className="mf-num"');                                          // el porcentaje es el protagonista
        expect(SRC).toContain("padding: 'calc(env(safe-area-inset-top, 0px) + 5.5rem) 1.5rem 3rem'");   // no choca con el wordmark en móvil
        expect(SRC).toContain("className={`mf-dot mf-dot--${state}`}");                     // fases como puntos, no píldoras
        expect(SRC).toContain("{ key: 'perfil', phases: [null, 'analyzing']");
        expect(SRC).toContain("{ key: 'revision', phases: ['review']");
        expect(SRC).toContain("aria-current={state === 'active' ? 'step' : undefined}");
    });
    it('respeta prefers-reduced-motion y conserva cancelar de un clic', () => {
        expect(SRC).toContain('@media (prefers-reduced-motion: reduce)');
        expect(SRC).toContain("navigateCancel('/assessment', { replace: true });");
        expect(SRC).toContain('LoadingScreen.propTypes = { status: PropTypes.string, streamPhase: PropTypes.string, daysCompleted: PropTypes.array, onCancel: PropTypes.func };');
    });
});

describe('catálogos', () => {
    it('las claves nuevas están en los 4 idiomas y las viejas del 3-6 desaparecieron', () => {
        for (const [loc, cat] of LOCALES) {
            for (const k of ['Transcurrido', 'Estructura', 'Coherencia',
                'Suele tardar entre 5 y 15 minutos según tu perfil y las revisiones del plan.',
                'Normalmente tarda unos {p50} minutos; 9 de cada 10 planes están listos antes de {p90}.',
                'Ya pasamos la marca habitual; casi todos los planes terminan antes de {p90} minutos.',
                'Está tardando más de lo habitual. Seguimos trabajando en tu plan; puedes salir y te avisamos.']) {
                expect(cat[k], `${loc}: ${k}`).toBeTruthy();
            }
            expect(cat['Transcurrido {tiempo} · estimado 3-6 minutos'], loc).toBeUndefined();
            expect(cat['Esto suele tomar entre 3 y 6 minutos.'], loc).toBeUndefined();
        }
    });
});
