import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('../utils/fotosDeComidas', () => ({ guardarFotoDeComida: vi.fn(async () => true), idsConFoto: vi.fn(async () => new Set()) }));
import { guardarFotoDeComida, idsConFoto } from '../utils/fotosDeComidas';
import { recordarFotosDelChat, vincularFotosDelChat } from '../utils/fotosDelChat';
const UID = 'user-photos';
const MID = '11111111-1111-4111-8111-111111111111';
const CHAT = 'chat-photos';
const NOW = Date.UTC(2026, 9, 1, 18);
const blob = () => new Blob(['photo'], { type: 'image/jpeg' });
const recordar = (ses = CHAT, id = 'new-photo', description = 'Lasaña con carne') => recordarFotosDelChat(UID,
    [{ attachment_id: id, kind: 'plato', description, file: blob() }], { ahora: NOW, sesion: ses });
const servidor = (exists = true) => ({
    fetchJson: vi.fn(async (url) => url === `/api/diary/meal/${MID}`
        ? (exists ? { meal: { id: MID, source: 'manual', meal_name: 'Lasaña con carne' } } : null)
        : { meals: [{ id: MID, created_at: new Date(NOW - 7 * 86400000).toISOString() }] }),
    fetchBlob: vi.fn(async () => blob()),
    ahora: NOW + 1000, cierraTurnoDe: CHAT, idsCorregidos: [MID],
});
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); vi.mocked(guardarFotoDeComida).mockResolvedValue(true); vi.mocked(idsConFoto).mockResolvedValue(new Set()); });

it('adds the correction photo to the exact original meal, even manually logged seven days before', async () => {
    recordar(); const s = servidor();
    expect(await vincularFotosDelChat(UID, s)).toBe(1);
    expect(guardarFotoDeComida).toHaveBeenCalledWith(UID, MID, expect.any(Blob));
    expect(JSON.parse(localStorage.getItem(`mealfit_fotos_corregidas:${UID}`))).toEqual([]);
});
it('does not attach to an old meal just because its name resembles a pending photo', async () => {
    recordar(); expect(await vincularFotosDelChat(UID, { ...servidor(), idsCorregidos: [] })).toBe(0);
    expect(guardarFotoDeComida).not.toHaveBeenCalled();
});
it('does not cross a different chat or account', async () => {
    recordar('other-chat'); expect(await vincularFotosDelChat(UID, servidor())).toBe(0);
    recordar(); expect(await vincularFotosDelChat('another-user', servidor())).toBe(0);
    expect(guardarFotoDeComida).not.toHaveBeenCalled();
});
it('does not save for a missing, deleted or unowned meal', async () => {
    recordar(); expect(await vincularFotosDelChat(UID, servidor(false))).toBe(0);
    expect(guardarFotoDeComida).not.toHaveBeenCalled();
});
it('retries a failed image save when opening the counter, without losing the receipt', async () => {
    recordar(); vi.mocked(guardarFotoDeComida).mockResolvedValueOnce(false);
    expect(await vincularFotosDelChat(UID, servidor())).toBe(0);
    expect(JSON.parse(localStorage.getItem(`mealfit_fotos_corregidas:${UID}`))).toHaveLength(1);
    expect(await vincularFotosDelChat(UID, { ...servidor(), idsCorregidos: [], cierraTurnoDe: null })).toBe(1);
});
it('chooses the matching photo when the current turn contains different foods', async () => {
    recordar(); recordar(CHAT, 'salad-photo', 'Ensalada de lechuga y tomate');
    const s = servidor(); s.fetchBlob = vi.fn(async () => { throw new Error('use uploaded blobs'); });
    expect(await vincularFotosDelChat(UID, s)).toBe(1);
    const stored = JSON.parse(localStorage.getItem(`mealfit_fotos_del_chat:${UID}`));
    expect(stored.find(f => f.id === 'new-photo').enlazadaEn).toBe(NOW + 1000);
    expect(stored.find(f => f.id === 'salad-photo').enlazadaEn).toBeNull();
});
it('replaces an older picture only for the server-confirmed corrected meal', async () => {
    recordar(); vi.mocked(idsConFoto).mockResolvedValue(new Set([MID]));
    expect(await vincularFotosDelChat(UID, servidor())).toBe(1);
    expect(guardarFotoDeComida).toHaveBeenCalledWith(UID, MID, expect.any(Blob));
});
