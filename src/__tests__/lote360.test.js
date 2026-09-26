// [P1-PLAN-LOTE-360 · 2026-09-26] Al volver de la galería, el iPhone se congelaba 769 ms.
//
// La sonda del dueño (paquete 20260926-034121): fVuelve +5450 → fLeida +5479 (leer el archivo, 29 ms) → la caja
// empieza a subir (+5529) y NO hay fotogramas hasta +6303: `pausa 769ms`; mientras, iOS paneó la página (S=335) y al
// volver el chat la recolocó de golpe. La preparación (prepW +6286) empezó DESPUÉS: no es ella. En el arnés (Chrome,
// build de producción, CPU ×4) añadir la misma foto de 1600 px cuesta ≤117 ms y ningún script > 5 ms: no es nuestro
// JS. Queda pintar la vista previa a tamaño completo, que WebKit de iOS decodifica en el hilo principal. En iOS la
// caja ya no pinta la foto grande: un hueco hasta la miniatura de 360 px, que hace el worker y ya no espera 650 ms.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { vistaPreviaDelAdjunto } from '../utils/vistaPreviaDelAdjunto';

const leer = (rel) => readFileSync(resolve(__dirname, '..', rel), 'utf8');
const item = (x) => ({ id: 'a', status: 'preparing', previewUrl: 'blob:grande', thumbDataUrl: null, ...x });

describe('[360] qué pinta la caja mientras se prepara la foto', () => {
    it('con miniatura, la miniatura (en todas partes)', () => {
        expect(vistaPreviaDelAdjunto(item({ thumbDataUrl: 'data:mini' }), { ios: true })).toBe('data:mini');
        expect(vistaPreviaDelAdjunto(item({ thumbDataUrl: 'data:mini' }), { ios: false })).toBe('data:mini');
    });

    it('en iOS, preparando: NADA grande (un hueco) — decodificarla congelaba el teléfono', () => {
        expect(vistaPreviaDelAdjunto(item(), { ios: true })).toBeNull();
    });

    it('fuera de iOS se sigue viendo al instante (lote 138: el navegador la decodifica fuera del hilo principal)', () => {
        expect(vistaPreviaDelAdjunto(item(), { ios: false })).toBe('blob:grande');
    });

    it('lista y sin miniatura (un borrador restaurado): la grande, también en iOS', () => {
        expect(vistaPreviaDelAdjunto(item({ status: 'ready' }), { ios: true })).toBe('blob:grande');
    });

    it('rota o con error: hueco', () => {
        expect(vistaPreviaDelAdjunto(item(), { ios: false, rota: true })).toBeNull();
        expect(vistaPreviaDelAdjunto(item({ status: 'error' }), { ios: false })).toBeNull();
    });
});

describe('[360] cableado', () => {
    it('la caja del chat usa la regla', () => {
        const ap = leer('pages/AgentPage.jsx');
        expect(ap).toContain('const srcVista = vistaPreviaDelAdjunto(item, { ios: _esIOS, rota: previewsRotas.has(item.id) });');
    });

    it('con el worker disponible la preparación no espera 650 ms (solo esperaba por el hilo principal)', () => {
        const ap = leer('pages/AgentPage.jsx');
        expect(ap).toContain('prepararTrasMs: reopenKeyboardAfterAttachmentRef.current && !workerDeImagenDisponible() ? ESPERA_PREPARAR_FOTO_MS : 0');
    });

    it('la sonda marca cuándo entra la foto y cuándo está la miniatura', () => {
        const h = leer('hooks/useChatAttachments.js');
        expect(h).toContain("marcarSondaTeclado('fAdd')");
        expect(h).toContain("marcarSondaTeclado('fMini')");
    });
});
