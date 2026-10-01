// [P1-PLAN-LOTE-727 · 2026-09-29] «sigue sin haber foto en los detalles»: la foto de unos limoncillos mandada al chat
// se clasificó 'items' (sueltos) y el 726 solo recordaba 'plato'. Aquí, el caso real y las compras que NO deben pegarse.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('../utils/fotosDeComidas', () => ({
    guardarFotoDeComida: vi.fn(async () => true),
    idsConFoto: vi.fn(async () => new Set()),
}));

import { guardarFotoDeComida, idsConFoto } from '../utils/fotosDeComidas';
import {
    recordarFotosDelChat, vincularFotosDelChat, fotoParaComida, hablanDeLoMismo, MAX_TURNOS_DESPUES,
} from '../utils/fotosDelChat';

const UID = '61a13831-2a70-4437-a084-0d3e09b653e4';
const CHAT = '677b6d1e-a254-4ece-a5cc-698269a4bac2';
// 28-sep 21:10:47 hora RD = 29-sep 01:10:47 UTC, la foto; la comida nació a las 01:11:16
const T0 = Date.UTC(2026, 8, 29, 1, 10, 47);
const iso = (ms) => new Date(ms).toISOString();
const blob = () => new Blob(['jpg'], { type: 'image/jpeg' });
const lista = () => JSON.parse(window.localStorage.getItem(`mealfit_fotos_del_chat:${UID}`) || '[]');

/** El servidor de mentira: el día trae `meals`; el detalle, lo que devuelve `GET /api/diary/meal/{id}`. */
const servidor = (meals) => ({
    fetchJson: vi.fn(async (url) => {
        if (url.startsWith('/api/diary/consumed/')) return { meals };
        const id = url.split('/').pop();
        const m = meals.find((x) => x.id === id);
        return m ? {
            success: true,
            meal: { id, source: m.source, meal_name: m.meal_name, ingredientes: { lineas: (m.ingredients || []).map((texto) => ({ texto })) } },
        } : null;
    }),
    fetchBlob: vi.fn(async () => blob()),
});

beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(guardarFotoDeComida).mockClear();
    vi.mocked(idsConFoto).mockResolvedValue(new Set());
});

describe('¿hablan de lo mismo la foto y la comida?', () => {
    it('plurales, acentos y cantidades no estorban', () => {
        expect(hablanDeLoMismo('Unos 2 limoncillos sueltos', 'Limoncillos 2 limoncillos (≈60 g)')).toBe(true);
        expect(hablanDeLoMismo('Tres limones', 'Jugo de limón')).toBe(true);
        expect(hablanDeLoMismo('Huevos fritos con tajadas de plátano maduro', 'Cena 4 huevos revueltos; 1 plátano')).toBe(true);
    });
    it('palabras de medida o cocción no casan dos cosas distintas; «papa» no es «papaya»', () => {
        expect(hablanDeLoMismo('Plato de arroz blanco frito', 'Plato de pollo frito')).toBe(false);
        expect(hablanDeLoMismo('Dos papayas', 'Puré de papa')).toBe(false);
        expect(hablanDeLoMismo('Compra: guineos, tomates, cebollas', 'Mangú con salami')).toBe(false);
        expect(hablanDeLoMismo('', 'Limoncillos')).toBe(false);
    });
});

describe('qué se recuerda', () => {
    it('plato y sueltos sí; la etiqueta de un pote, lo que no es comida y el análisis fallido no', () => {
        recordarFotosDelChat(UID, [
            { attachment_id: 'limon', kind: 'items', description: '2 limoncillos', image_url: '/a/limon' },
            { attachment_id: 'pote', kind: 'etiqueta', description: 'Atlas Gainer', image_url: '/a/pote' },
            { attachment_id: 'mesa', kind: 'otro', image_url: '/a/mesa' },
            { attachment_id: 'rota', kind: 'plato', analysis_failed: true, image_url: '/a/rota' },
        ], { ahora: T0, sesion: CHAT });
        expect(lista().map((f) => [f.id, f.kind, f.desc, f.ses, f.turnos])).toEqual([['limon', 'items', '2 limoncillos', CHAT, 0]]);
    });
});

describe('el caso de los limoncillos', () => {
    it('foto (turno 1) → «¿te los comiste?» → «Me los comí» (turno 2, el coach anota) ⇒ la ficha tiene la foto', async () => {
        recordarFotosDelChat(UID, [{ attachment_id: 'limon', kind: 'items', description: 'Unos 2 limoncillos', image_url: '/a/limon', file: blob() }],
            { ahora: T0, sesion: CHAT });
        // turno de la foto: el coach solo pregunta
        const vacio = servidor([]);
        expect(await vincularFotosDelChat(UID, { ...vacio, ahora: T0 + 4000, cierraTurnoDe: CHAT })).toBe(0);
        expect(lista()[0].turnos).toBe(1);
        // «Me los comí»: el coach anota «Limoncillos» a las 01:11:16
        const s = servidor([{ id: '6c4aa29a', created_at: iso(T0 + 29000), source: 'chat', meal_name: 'Limoncillos', ingredients: ['2 limoncillos (≈60 g)'] }]);
        expect(await vincularFotosDelChat(UID, { ...s, ahora: T0 + 32000, cierraTurnoDe: CHAT })).toBe(1);
        expect(guardarFotoDeComida.mock.calls[0][1]).toBe('6c4aa29a');
        expect(lista()[0]).toMatchObject({ enlazadaEn: T0 + 29000, turnos: 2 });
    });

    it('la foto de una compra no se pega a lo que anotas en el turno siguiente', async () => {
        recordarFotosDelChat(UID, [{ attachment_id: 'compra', kind: 'items', description: 'Guineos, tomates y cebollas', image_url: '/a/c', file: blob() }],
            { ahora: T0, sesion: CHAT });
        await vincularFotosDelChat(UID, { ...servidor([]), ahora: T0 + 4000, cierraTurnoDe: CHAT });
        const s = servidor([{ id: 'mangu', created_at: iso(T0 + 60000), source: 'chat', meal_name: 'Mangú con salami', ingredients: ['2 plátanos verdes', '60 g de salami'] }]);
        expect(await vincularFotosDelChat(UID, { ...s, ahora: T0 + 62000, cierraTurnoDe: CHAT })).toBe(0);
        expect(guardarFotoDeComida).not.toHaveBeenCalled();
    });

    it('lo que el coach anota en el MISMO turno de la foto se la queda sin comparar nombres', () => {
        const fotos = [{ id: 'f', t: T0, enlazadaEn: null, kind: 'plato', desc: 'Un plato de comida', turnos: 0 }];
        expect(fotoParaComida(fotos, T0 + 9000, 'Locrio de pollo').id).toBe('f');
    });

    it(`pasados ${MAX_TURNOS_DESPUES} turnos, la foto ya no se da a nadie`, async () => {
        recordarFotosDelChat(UID, [{ attachment_id: 'limon', kind: 'items', description: 'limoncillos', image_url: '/a/l', file: blob() }],
            { ahora: T0, sesion: CHAT });
        for (let i = 1; i <= MAX_TURNOS_DESPUES + 1; i += 1) {
            await vincularFotosDelChat(UID, { ...servidor([]), ahora: T0 + i * 1000, cierraTurnoDe: CHAT });
        }
        expect(lista()).toEqual([]);
        const fotos = [{ id: 'l', t: T0, enlazadaEn: null, desc: 'limoncillos', turnos: MAX_TURNOS_DESPUES + 1 }];
        expect(fotoParaComida(fotos, T0 + 60000, 'Limoncillos')).toBeNull();
    });

    it('el turno de OTRO chat no cuenta para la foto; el panel enlaza sin cerrar turnos', async () => {
        recordarFotosDelChat(UID, [{ attachment_id: 'limon', kind: 'items', description: 'limoncillos', image_url: '/a/l', file: blob() }],
            { ahora: T0, sesion: CHAT });
        await vincularFotosDelChat(UID, { ...servidor([]), ahora: T0 + 1000, cierraTurnoDe: 'otro-chat' });
        await vincularFotosDelChat(UID, { ...servidor([]), ahora: T0 + 2000 });
        expect(lista()[0].turnos).toBe(0);
    });

    it('una foto subida mientras se enlazaba no se pierde ni cuenta un turno que no ha terminado', async () => {
        recordarFotosDelChat(UID, [{ attachment_id: 'a', kind: 'plato', description: 'arroz', image_url: '/a/a', file: blob() }],
            { ahora: T0, sesion: CHAT });
        const s = servidor([]);
        s.fetchJson.mockImplementation(async () => {
            recordarFotosDelChat(UID, [{ attachment_id: 'b', kind: 'plato', description: 'pollo', image_url: '/a/b' }], { ahora: T0 + 3000, sesion: CHAT });
            return { meals: [] };
        });
        await vincularFotosDelChat(UID, { ...s, ahora: T0 + 2000, cierraTurnoDe: CHAT });
        expect(lista().map((f) => [f.id, f.turnos])).toEqual([['a', 1], ['b', 0]]);
    });
});

describe('enganches', () => {
    const src = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');
    it('el chat recuerda con su sesión y cierra el turno de ESE chat, con el mismo usuario que el panel', () => {
        const ap = src('src/pages/AgentPage.jsx');
        expect(ap).toContain('const _uidFotos = session?.user?.id || userProfile?.id;');
        expect(ap).toContain('const _uidVinculo = session?.user?.id || userProfile?.id;');
        expect(ap).toContain('idsCorregidos: dataObj.diary_corrected_meal_ids');
    });
    it('el panel enlaza al abrirse y al volver a primer plano, con import dinámico', () => {
        const tp = src('src/components/dashboard/TrackingProgress.jsx');
        expect(tp).toContain('useEnlazarFotosDelChat(userId);');
        const hook = src('src/hooks/useFotosDeComidas.js');
        expect(hook).toContain("import('../utils/fotosDelChat').then((m) => m.vincularFotosDelChat(userId))");
        expect(hook).toContain("document.addEventListener('visibilitychange', enlazar);");
        expect(hook).not.toMatch(/^import .*fotosDelChat/m);
    });
});
