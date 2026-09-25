// [P1-PLAN-LOTE-165 · 2026-09-22] Idiomas en la frontera con el servidor, y el teclado en la parte web.
//
// La interfaz estaba traducida; lo que seguía en español venía de fuera: las frases de progreso del coach (lista
// española en `agent.py`), las unidades del catálogo y del escáner («taza», «unidad», «lasca»), los errores del
// servidor pintados tal cual, la «o» del login, «P · C · G» y el ritmo de la meta. Y en el iPhone el teclado tapaba
// el pie de las hojas de registrar comida y del escáner; fuera del chat la barra de pestañas flotaba sobre él.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { renderHook, act } from '@testing-library/react';
import { loadLocale, t } from '../i18n';
import { DEFAULT_LOCALE } from '../i18n/locales';
import { glossUnitWord } from '../utils/shoppingHelpers';
import { unitsFor, searchFoods } from '../utils/foodSearch';
import { useTecladoDeHoja, estilosDeHojaConTeclado } from '../hooks/useTecladoDeHoja';
import { _reiniciarAltoDeReferencia } from '../utils/keyboardViewport';

const leer = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8').replace(/\r\n/g, '\n');

afterEach(async () => { await loadLocale(DEFAULT_LOCALE); });

describe('lote 165 · el coach dice su progreso en el idioma del usuario', () => {
    it('el progreso se pinta por FASE traducida; la frase española del servidor, solo en español y sin fase', () => {
        const a = leer('src/pages/AgentPage.jsx');
        const i = a.indexOf("if (dataObj.type === 'progress') {");
        const h = a.slice(i, i + 400);
        expect(h).toContain('frasesDeFase[dataObj.phase]');
        expect(h).toContain("(String(getLocale() || '').startsWith('es') ? dataObj.message : null)");
        expect(h).not.toMatch(/setStreamingStatus\(dataObj\.message\);/);
        for (const fase of ['analizando', 'generando_plan', 'modificando_comida', 'actualizando_bd',
            'registrando_progreso', 'calculando_compras', 'buscando_memoria']) {
            expect(a).toMatch(new RegExp(`\\b${fase}: t\\('`));
        }
    });
});

describe('lote 165 · las unidades del catálogo y del escáner se glosan al pintarse', () => {
    it('«taza», «unidad», «lasca», «rodaja», «cucharada» y «porción» en inglés', async () => {
        await loadLocale('en-US');
        expect(glossUnitWord('taza', t)).toBe('cup');
        expect(glossUnitWord('unidad', t)).toBe('unit');
        expect(glossUnitWord('lasca', t)).toBe('slice');
        expect(glossUnitWord('rodajas', t)).toBe('slices');
        expect(glossUnitWord('cucharada', t)).toBe('tablespoon');
        expect(glossUnitWord('porción', t)).toBe('serving');
        expect(glossUnitWord('g', t)).toBe('g');   // los símbolos no se traducen
    });

    it('el componedor: el rótulo de la porción y su subtítulo, en el idioma; la clave `unit` del motor intacta', async () => {
        await loadLocale('en-US');
        const food = { id: 7, name: 'Arroz blanco', name_en: 'White rice', portions: [
            { unit: 'g', grams_per_qty: 1, label: 'g' },
            { unit: 'taza', grams_per_qty: 158, label: 'taza', default: true },
        ] };
        const entry = { kind: 'food', ref: 'food:7', label: food.name, item: food };
        expect(unitsFor(entry)).toEqual([{ unit: 'g', label: 'g' }, { unit: 'taza', label: 'cup' }]);
        const [hit] = searchFoods('arroz', [food], []);
        expect(hit.sub).toContain('cup 158 g');
    });

    it('el escáner glosa la unidad de cada componente (el nombre no: es del motor)', () => {
        const s = leer('src/components/dashboard/ScanMealModal.jsx');
        // [P1-PLAN-LOTE-223] la unidad va junto a su cantidad («− 2 + tazas»), con su plural, y se sigue glosando
        expect(s).toContain('{glossUnitWord(unidadParaCantidad(c.unit, c.qty), t)}');
    });
});

describe('lote 165 · los errores del servidor ya no se pintan tal cual', () => {
    it('registrar comida: por código o el aviso propio; el 429 con su frase; sin red, nunca «Failed to fetch»', () => {
        const s = leer('src/components/dashboard/LogMealModal.jsx');
        expect(s).not.toContain("throw new Error(data?.message || data?.detail || t('No se pudo registrar.'));");
        expect(s).toContain("mensajeDeError(data, t('No se pudo registrar.'), t);");
        expect(s).toContain("toast.error(e?.paraMostrar ? e.message : t('No se pudo registrar. Intenta de nuevo.'));");
        expect(s).not.toContain('data?.error_message ||');
    });

    it('borrar la cuenta: el `detail` pasa por el código', () => {
        const s = leer('src/components/account/DeleteAccountSection.jsx');
        expect(s).toContain('detail = mensajeDeError(j, detail, t);');
        expect(s).not.toContain('if (j?.detail) detail = j.detail;');
    });

    it('la «o» del login, «P · C · G» del diario y el ritmo de la meta se traducen', () => {
        expect(leer('src/pages/Login.jsx')).toContain("<div className=\"mf-divider\"><span>{t('o')}</span></div>");
        const d = leer('src/components/dashboard/DiaryHistory.jsx');
        expect(d).toContain("t('P {p} · C {c} · G {g}', {");
        expect(d).toContain('diaSemana: _diaEnFrase(getDiasLargo(t)[creado.getDay()]),');
        const tp = leer('src/components/dashboard/TrackingProgress.jsx');
        expect(tp).toContain("{ gradual: t('Gradual'), moderado: t('Moderado'), decidido: t('Decidido') }[planData.goal_eta.pace]");
        expect(tp).not.toContain('title={planData.goal_eta.note}');
    });

    it('las abreviaturas son las de cada idioma', async () => {
        await loadLocale('en-US');
        expect(t('P {p} · C {c} · G {g}', { p: 30, c: 40, g: 10 })).toBe('P 30 · C 40 · F 10');
        await loadLocale('fr-FR');
        expect(t('P {p} · C {c} · G {g}', { p: 30, c: 40, g: 10 })).toBe('P 30 · G 40 · L 10');
    });
});

describe('lote 165 · el teclado en la parte web', () => {
    const fingirTeclado = ({ inner = 844, vvAlto = 844, top = 0 } = {}) => {
        const oyentes = {};
        const vv = {
            height: vvAlto, offsetTop: top,
            addEventListener: (e, fn) => { oyentes[e] = fn; },
            removeEventListener: vi.fn(),
        };
        Object.defineProperty(window, 'innerHeight', { value: inner, configurable: true });
        Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
        return { vv, oyentes };
    };
    afterEach(() => { _reiniciarAltoDeReferencia(); });

    it('con el teclado abierto (el documento no encoge, como en el iPhone), la hoja sube lo que el teclado tapa', () => {
        _reiniciarAltoDeReferencia();
        const { vv, oyentes } = fingirTeclado();
        const { result } = renderHook(() => useTecladoDeHoja(true));
        expect(result.current).toEqual({ inset: 0, abierto: false, alto: null });
        act(() => { vv.height = 500; oyentes.resize(); });
        expect(result.current.abierto).toBe(true);
        expect(result.current.inset).toBe(344);
        expect(result.current.alto).toBe(500);
        const e = estilosDeHojaConTeclado(result.current);
        expect(e.fondo).toEqual({ paddingBottom: 344 });
        expect(e.panel).toEqual({ maxHeight: 488 });
    });

    it('cerrada la hoja, o sin teclado, no toca nada', () => {
        _reiniciarAltoDeReferencia();
        fingirTeclado();
        const { result } = renderHook(() => useTecladoDeHoja(false));
        expect(result.current.abierto).toBe(false);
        expect(estilosDeHojaConTeclado(result.current)).toEqual({ fondo: undefined, panel: undefined });
    });

    it('las dos hojas lo aplican al fondo y al panel', () => {
        const l = leer('src/components/dashboard/LogMealModal.jsx');
        expect(l).toContain('const teclado = estilosDeHojaConTeclado(useTecladoDeHoja(true));');
        expect(l).toContain('<div className={styles.overlay} style={teclado.fondo}>');
        expect(l).toContain('style={teclado.panel}');
        const s = leer('src/components/dashboard/ScanMealModal.jsx');
        expect(s).toContain('const teclado = estilosDeHojaConTeclado(useTecladoDeHoja(isOpen));');
        expect(s).toContain('style={teclado.fondo}');
        expect(s).toContain('style={teclado.panel}');
    });

    it('fuera del chat, un campo enfocado en pantalla táctil esconde la barra de pestañas; en el chat manda el teclado', () => {
        const css = leer('src/components/dashboard/BottomTabBar.module.css');
        const i = css.indexOf('@media (max-width: 1024px) and (pointer: coarse) {');
        expect(i).toBeGreaterThan(-1);
        const regla = css.slice(i, css.indexOf('}\n}', i));
        expect(regla).toContain(':global(html:not(:has(.agent-route-active)):has(');
        expect(regla).toContain(':focus)) .tabBar {');
        expect(regla).toContain('transform: translateY(110%) !important;');
        // la regla del chat sigue siendo la del teclado de verdad
        expect(css).toContain(':global(html[data-kb-open]) .tabBar {');
    });
});
