// [P1-PLAN-LOTE-1184 · 2026-11-27] Las fotos del escáner en el servidor: subir tras registrar y traer al dispositivo.
import { describe, expect, it, vi, beforeEach } from 'vitest';

const subidas = [];
const guardadas = [];
let locales = new Set();
let lista = [];
let delDispositivo = {};

vi.mock('../config/api', () => ({
    fetchWithAuth: vi.fn(async (url, opts) => {
        if (opts?.method === 'POST') { subidas.push({ url, body: opts.body }); return { ok: true, json: async () => ({ success: true }) }; }
        if (url === '/api/diary/meal-photos') return { ok: true, json: async () => ({ photos: lista }) };
        return { ok: true, blob: async () => new Blob(['x'], { type: 'image/jpeg' }) };
    }),
}));
vi.mock('../utils/fotosDeComidas', () => ({
    reducirImagen: vi.fn(async () => new Blob(['r'], { type: 'image/jpeg' })),
    idsConFoto: vi.fn(async () => locales),
    guardarFotoDeComida: vi.fn(async (u, m, b, o) => { guardadas.push({ m, o }); return true; }),
    leerFotosDeComida: vi.fn(async (u, m) => delDispositivo[m] || []),
}));

import { subirFotoDeComida, traerFotosDelServidor, _reiniciarParaPruebas } from '../utils/fotosDelServidor';

const M1 = '11111111-1111-1111-1111-111111111111';
const M2 = '22222222-2222-2222-2222-222222222222';
const P1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const P2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const P3 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const foto = (id, meal) => ({ id, meal_id: meal, url: `/api/diary/meal-photo/${id}?v=foto&expires=1&sig=s` });

describe('lote 1184 · fotos del servidor', () => {
    beforeEach(() => { subidas.length = 0; guardadas.length = 0; locales = new Set(); lista = []; delDispositivo = {}; localStorage.clear(); _reiniciarParaPruebas(); });

    it('sube la foto y su miniatura al endpoint de la comida', async () => {
        expect(await subirFotoDeComida(M1, new Blob(['a'], { type: 'image/jpeg' }))).toBe(true);
        expect(subidas[0].url).toBe(`/api/diary/meal/${M1}/photo`);
        expect(subidas[0].body.get('foto')).toBeTruthy();
        expect(subidas[0].body.get('mini')).toBeTruthy();
        expect(await subirFotoDeComida('no-es-uuid', new Blob(['a']))).toBe(false);
    });

    it('trae solo las de comidas sin foto en este dispositivo, la primera reemplaza y las demás se anexan', async () => {
        locales = new Set([M2]);                     // el iPhone que la tomó ya la tiene: no se duplica
        lista = [foto(P1, M1), foto(P2, M1), foto(P3, M2)];
        expect(await traerFotosDelServidor('u1')).toBe(2);
        expect(guardadas.map((g) => [g.m, g.o.attachmentId, g.o.anexar])).toEqual([
            [M1, `srv:${P1}`, false],
            [M1, `srv:${P2}`, true],
        ]);
    });

    it('ignora URLs que no son de este endpoint y no repite antes de un minuto', async () => {
        lista = [{ id: P1, meal_id: M1, url: 'https://malo.example/x.jpg' }];
        expect(await traerFotosDelServidor('u1')).toBe(0);
        lista = [foto(P1, M1)];
        expect(await traerFotosDelServidor('u1')).toBe(0);                     // dentro del minuto
        expect(await traerFotosDelServidor('u1', { forzar: true })).toBe(1);
        expect(await traerFotosDelServidor('guest', { forzar: true })).toBe(0);
    });

    // [P1-PLAN-LOTE-1185] la foto del escáner tomada ANTES de 1184 la sube el dispositivo que la tiene.
    it('sube una vez las fotos del escáner que el servidor no tiene; las del chat y las ya subidas no', async () => {
        const M3 = '33333333-3333-3333-3333-333333333333';
        locales = new Set([M1, M2, M3]);
        lista = [foto(P3, M2)];                                            // M2 ya está en el servidor
        delDispositivo = {
            [M1]: [{ id: null, blob: new Blob(['e'], { type: 'image/jpeg' }) }],          // del escáner
            [M2]: [{ id: null, blob: new Blob(['e'], { type: 'image/jpeg' }) }],
            [M3]: [{ id: 'adjunto-del-chat', blob: new Blob(['c'], { type: 'image/jpeg' }) }],
        };
        await traerFotosDelServidor('u1');
        expect(subidas.map((x) => x.url)).toEqual([`/api/diary/meal/${M1}/photo`]);
        await traerFotosDelServidor('u1', { forzar: true });             // otra pasada: no repite
        expect(subidas).toHaveLength(1);
    });
});
