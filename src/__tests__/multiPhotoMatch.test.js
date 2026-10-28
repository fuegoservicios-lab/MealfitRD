// [P1-MULTI-PHOTO-MATCH · 2026-10-27] Pruebas para turnos multi-foto:
// Guineo de desayuno + Sancocho de almuerzo no deben mezclar fotos entre comidas distintas,
// y reconcilian la caché local si una foto se asignó erróneamente.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('../utils/fotosDeComidas', () => ({
    guardarFotoDeComida: vi.fn(async () => true),
    removerAdjuntoDeComida: vi.fn(async () => true),
    idsConFoto: vi.fn(async () => new Set()),
    idsDeFotosDeComida: vi.fn(async () => new Set()),
}));

import { guardarFotoDeComida, removerAdjuntoDeComida, idsDeFotosDeComida } from '../utils/fotosDeComidas';
import { fotoParaComida, fotosParaComida, vincularFotosDelChat } from '../utils/fotosDelChat';

const UID = '61a13831-2a70-4437-a084-0d3e09b653e4';
const T0 = 1730000000000;

describe('Multi-foto en el mismo turno', () => {
    const fotoGuineo = {
        id: '311d1905-fc29-421f-b11c-c2d3f23828bd',
        desc: '1 guineo maduro mediano. Estimación nutricional: 90 kcal.',
        t: T0,
        turnos: 0,
        ses: 'chat-1',
    };
    const fotoSancocho = {
        id: '2878bf51-4231-4e4a-8b05-a6597d292216',
        desc: 'Sancocho criollo con arroz blanco. Estimación nutricional: 710 kcal.',
        t: T0,
        turnos: 0,
        ses: 'chat-1',
    };

    it('fotoParaComida asigna la foto correcta por coincidencia léxica aunque ambas tengan el mismo timestamp', () => {
        // En array con sancocho primero:
        const fotos = [fotoSancocho, fotoGuineo];
        const resGuineo = fotoParaComida(fotos, T0 + 1000, '1 guineo maduro mediano');
        expect(resGuineo?.id).toBe(fotoGuineo.id);

        const resSancocho = fotoParaComida(fotos, T0 + 2000, 'Arroz blanco con sancocho criollo (2 tazas)');
        expect(resSancocho?.id).toBe(fotoSancocho.id);
    });

    it('fotosParaComida nunca anexa fotos no coincidentes cuando hay varias fotos en el turno', () => {
        const fotos = [fotoGuineo, fotoSancocho];
        const resGuineo = fotosParaComida(fotos, T0 + 1000, '1 guineo maduro mediano');
        expect(resGuineo.map((f) => f.id)).toEqual([fotoGuineo.id]);

        const resSancocho = fotosParaComida(fotos, T0 + 2000, 'Arroz blanco con sancocho criollo');
        expect(resSancocho.map((f) => f.id)).toEqual([fotoSancocho.id]);
    });

    it('vincularFotosDelChat remueve adjuntos cruzados si el servidor confirma que pertenecen a otra comida', async () => {
        const mealGuineoId = '58f5e2de-41d8-411d-ad9e-0728ac474cdd';
        const mealSancochoId = '57c056d3-4b3d-4aba-a681-3035139f3ae3';

        // Supongamos que la base local tenía erróneamente el sancocho dentro del guineo
        vi.mocked(idsDeFotosDeComida).mockImplementation(async (uid, mid) => {
            if (mid === mealGuineoId) return new Set([fotoGuineo.id, fotoSancocho.id]);
            if (mid === mealSancochoId) return new Set();
            return new Set();
        });

        const fetchJson = vi.fn(async (url) => {
            if (url.startsWith('/api/diary/chat-photos')) {
                return {
                    photos: [
                        { meal_id: mealGuineoId, attachment_id: fotoGuineo.id, image_url: `/api/chat/attachments/${fotoGuineo.id}` },
                        { meal_id: mealSancochoId, attachment_id: fotoSancocho.id, image_url: `/api/chat/attachments/${fotoSancocho.id}` },
                    ],
                };
            }
            return null;
        });

        const fetchBlob = vi.fn(async () => new Blob(['fake-img'], { type: 'image/jpeg' }));

        await vincularFotosDelChat(UID, { fetchJson, fetchBlob, ahora: T0 + 5000 });

        // Debe haber llamado a removerAdjuntoDeComida para sacar el sancocho del guineo
        expect(removerAdjuntoDeComida).toHaveBeenCalledWith(UID, mealGuineoId, fotoSancocho.id);
        // Y guardar el sancocho en el almuerzo
        expect(guardarFotoDeComida).toHaveBeenCalledWith(
            UID,
            mealSancochoId,
            expect.any(Blob),
            expect.objectContaining({ attachmentId: fotoSancocho.id })
        );
    });
});
