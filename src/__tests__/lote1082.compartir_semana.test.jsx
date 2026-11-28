// [P1-PLAN-LOTE-1082 · 2026-11-18] «Compartir mi semana» (decisión del dueño): la misma historia que el día —foto,
// tres estilos, cifras como sticker— con la semana: 7 anillos, días en meta, estrellas, racha y rango. Sin kcal.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../utils/tarjetaDelDia', () => ({ dibujarTarjetaDelDia: vi.fn(async () => new Blob(['png'], { type: 'image/png' })) }));
vi.mock('../utils/historiaConFoto', async (orig) => ({
    ...(await orig()),
    dibujarHistoriaConFoto: vi.fn(async () => new Blob(['jpg'], { type: 'image/jpeg' })),
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import { resumenDeSemana, textoDeSemana, PINTOR_SEMANA } from '../utils/compartirSemana';
import { cajaDeCifras, dibujarHistoriaConFoto, pintarHistoria, LIMITES_CIFRAS, ESTILOS } from '../utils/historiaConFoto';
import { dibujarTarjetaDelDia } from '../utils/tarjetaDelDia';
import ShareDaySheet from '../components/dashboard/ShareDaySheet';

const DIAS = ['meta', 'meta', 'bajo', 'vacio', 'meta', 'pasado', 'futuro'].map((estado, i) => ({
    iso: `2026-11-${String(15 + i).padStart(2, '0')}`, estado, ratio: estado === 'bajo' ? 0.6 : 1, letra: 'DLMMJVS'[i],
}));
const SEMANA = { numero: 10, enCurso: true, periodo: '15 nov – 21 nov', dias: DIAS, enMeta: 3, estrellas: 1, racha: 2, rango: 'plata' };

beforeEach(() => {
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:x');
    globalThis.URL.revokeObjectURL = vi.fn();
    vi.stubGlobal('navigator', { ...navigator, share: vi.fn().mockResolvedValue(undefined), canShare: () => true, clipboard: { writeText: vi.fn() } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('[1082] el resumen y el texto de la semana', () => {
    it('lleva lo que se ve en «Tu semana», con su pintor y sin kcal', () => {
        const r = resumenDeSemana(SEMANA);
        expect(r).toMatchObject({ tipo: 'semana', numero: 10, enMeta: 3, estrellas: 1, racha: 2, perfecta: false, rango: { clave: 'plata', nombre: 'Plata' } });
        expect(r.dias.map((d) => d.estado)).toEqual(['meta', 'meta', 'bajo', 'vacio', 'meta', 'pasado', 'futuro']);
        expect(r.pintor).toBe(PINTOR_SEMANA);
        expect(r.calorias).toBeUndefined();
        expect(r.pregunta).toBe('¿Y tú, cómo va tu semana?');
    });

    it('acota lo raro: estado desconocido = sin registros, estrellas 0-3, rango desconocido fuera', () => {
        const r = resumenDeSemana({ numero: 0, dias: [{ iso: '2026-11-15', estado: 'otro' }], estrellas: 9, rango: 'cobre' });
        expect(r.numero).toBe(1);
        expect(r.dias[0].estado).toBe('vacio');
        expect(r.estrellas).toBe(3);
        expect(r.rango).toBeNull();
        expect(resumenDeSemana({ dias: DIAS.map((d) => ({ ...d, estado: 'meta' })), enMeta: 7 }).perfecta).toBe(true);
    });

    it('el texto: la fila de días, días en meta, estrellas, racha y rango; sin racha corta', () => {
        const txt = textoDeSemana(resumenDeSemana(SEMANA));
        expect(txt).toContain('Semana 10 (15 nov – 21 nov)');
        // [P1-MACRO-BARS-SEMAFORO] un día cerrado por debajo y uno pasado salen en rojo; HOY por debajo, en curso (⏳)
        expect(txt).toContain('✅✅🔴⚪✅🔴▫️');
        const conHoy = { ...SEMANA, dias: DIAS.map((d, i) => (i === 2 ? { ...d, abierto: true } : d)) };
        expect(textoDeSemana(resumenDeSemana(conHoy))).toContain('✅✅⏳⚪✅🔴▫️');
        expect(txt).toContain('✅ 3 de 7 días en meta');
        expect(txt).toContain('⭐ 1 de 3 estrellas');
        expect(txt).toContain('🔥 Racha de 2 días');
        expect(txt).toContain('🏅 Rango Plata');
        expect(txt).not.toMatch(/kcal/);
        expect(textoDeSemana(resumenDeSemana({ ...SEMANA, racha: 1, rango: null }))).not.toMatch(/Racha|Rango/);
    });
});

describe('[1082] el dibujo', () => {
    it('en cada estilo (y con semana perfecta) el sticker cabe en sus límites', () => {
        for (const estilo of ESTILOS) {
            for (const s of [SEMANA, { ...SEMANA, enMeta: 7, dias: DIAS.map((d) => ({ ...d, estado: 'meta' })) }]) {
                const caja = cajaDeCifras(resumenDeSemana(s), estilo);
                expect(caja.y).toBeGreaterThanOrEqual(LIMITES_CIFRAS.y0);
                expect(caja.y + caja.h).toBeLessThanOrEqual(LIMITES_CIFRAS.y1);
            }
        }
    });

    it('pintarHistoria usa el pintor de la semana (y el día sigue con el suyo)', () => {
        const pintar = vi.fn();
        const r = { ...resumenDeSemana(SEMANA), pintor: { pintar, caja: PINTOR_SEMANA.caja } };
        const ctx = new Proxy({}, {
            get: (o, k) => (k in o ? o[k] : (k === 'measureText' ? () => ({ width: 10 }) : (k.startsWith?.('create') ? () => ({ addColorStop() {} }) : () => {}))),
            set: (o, k, v) => { o[k] = v; return true; },
        });
        const canvas = { width: 0, height: 0, getContext: () => ctx };
        expect(pintarHistoria(canvas, r, { estilo: 'minimal' })).toBe(true);
        expect(pintar).toHaveBeenCalledTimes(1);
        const [conQue, que, estilo] = pintar.mock.calls[0];
        expect(conQue === ctx && que.tipo === 'semana' && estilo === 'minimal').toBe(true);
        // y el pintor de verdad dibuja sin romperse en los tres estilos
        for (const estilo of ESTILOS) expect(pintarHistoria(canvas, resumenDeSemana(SEMANA), { estilo })).toBe(true);
    });
});

describe('[1082] la hoja con la semana', () => {
    it('título, periodo, estilos y deslizador de cifras; sin formatos ni «Incluir lo que comí»', async () => {
        render(<ShareDaySheet onClose={() => {}} semana={SEMANA} />);
        expect(screen.getByRole('heading', { name: 'Compartir tu semana' })).toBeTruthy();
        expect(screen.getByText('Semana 10 · 15 nov – 21 nov')).toBeTruthy();
        expect(screen.getByRole('radiogroup', { name: 'Estilo de la historia' })).toBeTruthy();
        expect(screen.getByRole('slider', { name: 'Tamaño de tus cifras' })).toBeTruthy();
        expect(screen.queryByRole('radiogroup', { name: 'Formato de la imagen' })).toBeNull();
        expect(screen.queryByText('Incluir lo que comí')).toBeNull();
        expect(screen.getByRole('img', { name: 'Mi semana: tu historia' }).tagName).toBe('CANVAS');
        await waitFor(() => expect(dibujarHistoriaConFoto).toHaveBeenCalled());
        expect(dibujarHistoriaConFoto.mock.calls.at(-1)[0]).toMatchObject({ tipo: 'semana', numero: 10 });
        expect(dibujarTarjetaDelDia).not.toHaveBeenCalled();
    });

    it('cambiar de estilo redibuja la semana con ese estilo', async () => {
        render(<ShareDaySheet onClose={() => {}} semana={SEMANA} />);
        fireEvent.click(screen.getByRole('radio', { name: /Bruma/ }));
        await waitFor(() => expect(dibujarHistoriaConFoto.mock.calls.at(-1)[1]).toMatchObject({ estilo: 'cristal' }));
    });
});

describe('[1082] las puertas', () => {
    const SEM = readFileSync(resolve(process.cwd(), 'src/components/dashboard/SemanaEnProgreso.jsx'), 'utf8');
    const CIE = readFileSync(resolve(process.cwd(), 'src/components/dashboard/CierreDeSemana.jsx'), 'utf8');
    it('«Tu semana» tiene el botón y carga la hoja perezosa con la semana', () => {
        expect(SEM).toContain("aria-label={t('Compartir tu semana')}");
        expect(SEM).toContain("const ShareDaySheet = lazy(() => import('./ShareDaySheet'));");
        expect(SEM).toContain('semana={semanaParaCompartir}');
        expect(SEM).toContain('racha: enCurso ? (juego ? rachaVivo : racha) : 0');   // [1161] racha registrando con el juego por puntos
    });
    it('el cierre del domingo invita a compartir esa semana', () => {
        expect(CIE).toContain('onCompartir(Number(cierre.datos.numero))');
        expect(SEM).toContain('onCompartir={compartirSemana}');
    });
});
