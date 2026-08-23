/**
 * [P1-KB-VIEWPORT-MATH · 2026-08-23] La aritmética del teclado, probada con números.
 *
 * Estos casos son el defecto que el dueño reportó, escrito como tabla. Con la fórmula
 * anterior —un solo escalar `H - vv.height - vv.offsetTop` usado a la vez como longitud
 * y como predicado— el tercer caso decía «no hay teclado» con el teclado en pantalla, y
 * ningún guard del repo podía verlo porque todos son parser-based y una resta de más no
 * tiene grafía distinta.
 *
 * H = innerHeight (en iOS NO cambia al abrirse el teclado)
 * K = alto del teclado           S = visualViewport.offsetTop (el paneo de iOS)
 * visualViewport.height = H - K  (panear mueve el visual viewport, no lo redimensiona)
 */
import { describe, it, expect } from 'vitest';
import { medirTeclado, medirTecladoDeVentana, KB_UMBRAL_PX } from '../utils/keyboardViewport';

const H = 800;
const K = 336; // teclado del iPhone en vertical, con la barra predictiva
const vvConTeclado = H - K; // 464

describe('[P1-KB-VIEWPORT-MATH] el predicado no depende del paneo de iOS', () => {
    it('sin paneo (S=0): kb=K y el inset de layout coincide con K', () => {
        const m = medirTeclado({ innerHeight: H, vvHeight: vvConTeclado, vvOffsetTop: 0 });
        expect(m.kb).toBe(K);
        expect(m.layoutInset).toBe(K);
        expect(m.abierto).toBe(true);
    });

    it('paneo parcial (S=120): kb sigue siendo K; el inset baja a K-S', () => {
        const m = medirTeclado({ innerHeight: H, vvHeight: vvConTeclado, vvOffsetTop: 120 });
        expect(m.kb).toBe(K);              // el predicado NO se mueve
        expect(m.layoutInset).toBe(K - 120); // la longitud SÍ, y debe
        expect(m.abierto).toBe(true);
    });

    it('EL DEFECTO: paneo completo (S=K) seguía diciendo «no hay teclado»', () => {
        const m = medirTeclado({ innerHeight: H, vvHeight: vvConTeclado, vvOffsetTop: K });
        // La fórmula vieja daba 0 aquí y apagaba el arreglo con el teclado abierto:
        expect(H - vvConTeclado - K).toBe(0);
        // La nueva mantiene el predicado y deja el inset en 0, que es lo correcto para
        // un elemento anclado al layout viewport cuando la pantalla ya está panéada.
        expect(m.kb).toBe(K);
        expect(m.abierto).toBe(true);
        expect(m.layoutInset).toBe(0);
    });

    it('el inset nunca es negativo aunque iOS reporte un paneo mayor que el teclado', () => {
        const m = medirTeclado({ innerHeight: H, vvHeight: vvConTeclado, vvOffsetTop: K + 50 });
        expect(m.layoutInset).toBe(0);
        expect(m.abierto).toBe(true);
    });
});

describe('[P1-KB-VIEWPORT-MATH] lo que NO es un teclado', () => {
    it('sin teclado: cerrado y sin inset', () => {
        const m = medirTeclado({ innerHeight: H, vvHeight: H, vvOffsetTop: 0 });
        expect(m).toEqual({ kb: 0, layoutInset: 0, abierto: false });
    });

    it('el cromo del navegador o un pinch-zoom encogen el viewport pero NO abren el teclado', () => {
        const m = medirTeclado({ innerHeight: H, vvHeight: H - (KB_UMBRAL_PX - 1), vvOffsetTop: 0 });
        expect(m.kb).toBeGreaterThan(0);
        expect(m.abierto).toBe(false);
    });

    it('justo en el umbral cuenta como teclado', () => {
        const m = medirTeclado({ innerHeight: H, vvHeight: H - KB_UMBRAL_PX, vvOffsetTop: 0 });
        expect(m.abierto).toBe(true);
    });
});

describe('[P1-KB-VIEWPORT-MATH] lectura del window real', () => {
    it('sin visualViewport (navegador viejo, SSR) degrada a cerrado en vez de romper', () => {
        expect(medirTecladoDeVentana(null)).toEqual({ kb: 0, layoutInset: 0, abierto: false });
        expect(medirTecladoDeVentana({ innerHeight: H })).toEqual({ kb: 0, layoutInset: 0, abierto: false });
    });

    it('con visualViewport delega en la función pura', () => {
        const win = { innerHeight: H, visualViewport: { height: vvConTeclado, offsetTop: K } };
        expect(medirTecladoDeVentana(win)).toEqual({ kb: K, layoutInset: 0, abierto: true });
    });
});
