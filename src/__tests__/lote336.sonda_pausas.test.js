// [P1-PLAN-LOTE-336 · 2026-09-26] La sonda del teclado anota las PAUSAS del hilo principal.
//
// La sonda del dueño (paquete 20260926-001936) enseñó que, al volver de la galería con el teclado abierto, el chat
// tardaba 1,1 s en colocarse cuando el teclado tarda 0,4 s — pero no si era la animación o el teléfono ocupado.
// WebKit no tiene la API de tareas largas: se mide con un bucle de fotogramas, y cada hueco > 50 ms se apunta como
// `pausa 218ms` (sin leer el layout: la fila de pausa no puede fabricar la pausa que mide).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const plataforma = vi.hoisted(() => ({ nativa: true }));
vi.mock('../config/platform', () => ({ isNativeApp: () => plataforma.nativa }));

import { alternarSondaTecladoNativa, detectorDePausas } from '../utils/keyboardProbe';

const caja = () => document.querySelector('pre[aria-hidden="true"]');

describe('[336] detector de pausas', () => {
    it('solo informa los huecos por encima del umbral', () => {
        const d = detectorDePausas(50);
        expect([d(0), d(16), d(33), d(250), d(266)]).toEqual([null, null, null, 217, null]);
    });
});

describe('[336] la sonda las pinta', () => {
    let cola;
    beforeEach(() => {
        cola = [];
        localStorage.clear();
        vi.stubGlobal('visualViewport', { height: 800, offsetTop: 0, addEventListener: vi.fn(), removeEventListener: vi.fn() });
        vi.stubGlobal('requestAnimationFrame', (fn) => { cola.push(fn); return cola.length; });
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
    });
    afterEach(() => { vi.unstubAllGlobals(); });

    const fotograma = (t) => { const fns = cola.splice(0); fns.forEach((fn) => fn(t)); };

    it('un hueco de 240 ms entre fotogramas aparece como fila «pausa»', () => {
        alternarSondaTecladoNativa();
        fotograma(1000); fotograma(1016); fotograma(1256); fotograma(1272);
        expect(caja().textContent).toMatch(/pausa\s+240ms/);
        alternarSondaTecladoNativa();
    });

    it('apagar la sonda para el bucle de fotogramas', () => {
        alternarSondaTecladoNativa();
        alternarSondaTecladoNativa();
        expect(cancelAnimationFrame).toHaveBeenCalled();
    });
});
