// [P1-PLAN-LOTE-726 · 2026-09-28] La foto que mandas al chat aparece en la ficha de la comida que el coach registra.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('../utils/fotosDeComidas', () => ({
    guardarFotoDeComida: vi.fn(async () => true),
    idsConFoto: vi.fn(async () => new Set()),
}));

import { guardarFotoDeComida, idsConFoto } from '../utils/fotosDeComidas';
import { recordarFotosDelChat, vincularFotosDelChat, fotoParaComida, VENTANA_MS, MISMO_TURNO_MS } from '../utils/fotosDelChat';

const UID = 'u-1';
const T0 = Date.UTC(2026, 8, 28, 19, 0, 0);
const iso = (ms) => new Date(ms).toISOString();
const blob = () => new Blob(['jpg'], { type: 'image/jpeg' });

/** El servidor de mentira: el día trae `meals`; el detalle, su `source`. */
const servidor = (meals) => ({
    fetchJson: vi.fn(async (url) => {
        if (url.startsWith('/api/diary/consumed/')) return { meals: url.includes(new Date(T0).toISOString().slice(0, 10)) ? meals : [] };
        const id = url.split('/').pop();
        const m = meals.find((x) => x.id === id);
        return m ? { success: true, meal: { id, source: m.source } } : null;
    }),
    fetchBlob: vi.fn(async () => blob()),
});

beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(guardarFotoDeComida).mockClear();
    vi.mocked(idsConFoto).mockResolvedValue(new Set());
});

describe('qué foto le toca a cada comida', () => {
    const fotos = [{ id: 'a', t: T0, enlazadaEn: null }, { id: 'b', t: T0 + 10 * 60000, enlazadaEn: null }];
    it('la más reciente anterior a la comida, dentro de la ventana', () => {
        expect(fotoParaComida(fotos, T0 + 5 * 60000).id).toBe('a');
        expect(fotoParaComida(fotos, T0 + 12 * 60000).id).toBe('b');
        expect(fotoParaComida(fotos, T0 - 60000)).toBeNull();
        expect(fotoParaComida([{ id: 'a', t: T0, enlazadaEn: null }], T0 + VENTANA_MS + 1000)).toBeNull();
    });
    it('una foto ya enlazada solo vale para lo del mismo turno', () => {
        const enlazada = [{ id: 'a', t: T0, enlazadaEn: T0 + 60000 }];
        expect(fotoParaComida(enlazada, T0 + 60000 + MISMO_TURNO_MS - 1000).id).toBe('a');
        expect(fotoParaComida(enlazada, T0 + 60000 + MISMO_TURNO_MS + 1000)).toBeNull();
    });
});

describe('recordar y enlazar', () => {
    it('solo se recuerdan las fotos de COMIDA (plato o sueltos; el 727 sumó los sueltos)', () => {
        recordarFotosDelChat(UID, [
            { attachment_id: 'p', kind: 'plato', image_url: '/api/chat/attachments/p', file: blob() },
            { attachment_id: 'c', kind: 'items', image_url: '/api/chat/attachments/c' },
            { attachment_id: 'x', kind: 'otro', image_url: '/api/chat/attachments/x' },
        ], { ahora: T0 });
        const lista = JSON.parse(window.localStorage.getItem(`mealfit_fotos_del_chat:${UID}`));
        expect(lista.map((f) => f.id)).toEqual(['p', 'c']);
        recordarFotosDelChat('guest', [{ attachment_id: 'g', kind: 'plato' }], { ahora: T0 });
        expect(window.localStorage.getItem('mealfit_fotos_del_chat:guest')).toBeNull();
    });

    it('la comida que el coach registra tras la foto se queda con ella; lo anotado a mano no', async () => {
        recordarFotosDelChat(UID, [{ attachment_id: 'p', kind: 'plato', image_url: '/api/chat/attachments/p', file: blob() }], { ahora: T0 });
        const s = servidor([
            { id: 'lasana', created_at: iso(T0 + 90000), source: 'chat' },
            { id: 'manual', created_at: iso(T0 + 95000), source: 'manual' },
            { id: 'vieja', created_at: iso(T0 - 3600000), source: 'chat' },
        ]);
        const n = await vincularFotosDelChat(UID, { ...s, ahora: T0 + 120000 });
        expect(n).toBe(1);
        expect(guardarFotoDeComida).toHaveBeenCalledTimes(1);
        expect(guardarFotoDeComida.mock.calls[0][1]).toBe('lasana');
        expect(s.fetchBlob).not.toHaveBeenCalled();   // el blob de la subida sigue en memoria
    });

    it('tras recargar (sin blob en memoria) la baja de su URL firmada', async () => {
        window.localStorage.setItem(`mealfit_fotos_del_chat:${UID}`, JSON.stringify([
            { id: 'recargada', url: '/api/chat/attachments/recargada?sig=1', t: T0, enlazadaEn: null },
        ]));
        const s = servidor([{ id: 'plato', created_at: iso(T0 + 60000), source: 'chat' }]);
        expect(await vincularFotosDelChat(UID, { ...s, ahora: T0 + 90000 })).toBe(1);
        expect(s.fetchBlob).toHaveBeenCalledWith('/api/chat/attachments/recargada?sig=1');
    });

    it('una comida que ya tiene foto (el escáner) no se toca', async () => {
        recordarFotosDelChat(UID, [{ attachment_id: 'p', kind: 'plato', file: blob() }], { ahora: T0 });
        vi.mocked(idsConFoto).mockResolvedValue(new Set(['plato']));
        const s = servidor([{ id: 'plato', created_at: iso(T0 + 60000), source: 'chat' }]);
        expect(await vincularFotosDelChat(UID, { ...s, ahora: T0 + 90000 })).toBe(0);
    });

    it('sin fotos recientes no pregunta nada al servidor', async () => {
        const s = servidor([]);
        expect(await vincularFotosDelChat(UID, { ...s, ahora: T0 })).toBe(0);
        expect(s.fetchJson).not.toHaveBeenCalled();
    });
});

describe('enganches en el chat', () => {
    const ap = readFileSync(resolve(process.cwd(), 'src/pages/AgentPage.jsx'), 'utf8');
    it('recuerda al subir y enlaza al cerrar el turno, con import dinámico', () => {
        expect(ap).toContain("const cargarFotosDelChat = () => import('../utils/fotosDelChat');");
        expect(ap).toContain('m.recordarFotosDelChat(_uidFotos, uploadedAttachments, { sesion: _sesionFotos })');
        const done = ap.indexOf("} else if (dataObj.type === 'done') {");
        expect(ap.slice(done, done + 2000)).toContain('m.vincularFotosDelChat(_uidVinculo, { cierraTurnoDe: currentSessionId })');
        expect(ap).not.toMatch(/^import .*fotosDelChat/m);
    });
});
