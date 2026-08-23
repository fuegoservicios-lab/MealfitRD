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
        expect(medirTecladoDeVentana(null)).toEqual({ kb: 0, layoutInset: 0, abierto: false, documentoEncoge: false });
        expect(medirTecladoDeVentana({ innerHeight: H })).toEqual({ kb: 0, layoutInset: 0, abierto: false, documentoEncoge: false });
    });

    it('con visualViewport delega en la función pura', () => {
        const win = { innerHeight: H, visualViewport: { height: vvConTeclado, offsetTop: K } };
        expect(medirTecladoDeVentana(win)).toEqual({ kb: K, layoutInset: 0, abierto: true, documentoEncoge: false });
    });
});

describe('[P1-KB-ALTO-DE-REFERENCIA] la referencia no se mueve con lo que mide', () => {
    it('PWA de pantalla de inicio: innerHeight encoge JUNTO con el teclado y aun así se detecta', async () => {
        const { _reiniciarAltoDeReferencia } = await import('../utils/keyboardViewport');
        _reiniciarAltoDeReferencia();
        // 1) sin teclado: aprende el alto real
        let win = { innerHeight: H, visualViewport: { height: H, offsetTop: 0 } };
        expect(medirTecladoDeVentana(win).abierto).toBe(false);
        // 2) teclado abierto y iOS encogió innerHeight a la par (la fórmula vieja daba 0 aquí)
        win = { innerHeight: vvConTeclado, visualViewport: { height: vvConTeclado, offsetTop: 0 } };
        const m = medirTecladoDeVentana(win);
        expect(m.kb).toBe(K);
        expect(m.abierto).toBe(true);
        // El documento YA encogió K por su cuenta (100dvh = 508): no queda nada que restar.
        // Con inset=K el contenedor se encogería dos veces: 508 − 336 = 172 px de chat.
        expect(m.layoutInset).toBe(0);
        // 3) teclado cerrado: vuelve a cerrado
        win = { innerHeight: H, visualViewport: { height: H, offsetTop: 0 } };
        expect(medirTecladoDeVentana(win).abierto).toBe(false);
    });

    it('Safari (innerHeight NO encoge): misma respuesta que antes', async () => {
        const { _reiniciarAltoDeReferencia } = await import('../utils/keyboardViewport');
        _reiniciarAltoDeReferencia();
        const win = { innerHeight: H, visualViewport: { height: vvConTeclado, offsetTop: K } };
        expect(medirTecladoDeVentana(win)).toEqual({ kb: K, layoutInset: 0, abierto: true, documentoEncoge: false });
    });

    it('el giro NO se confunde con un teclado: cada ancho tiene su propio máximo', async () => {
        const { _reiniciarAltoDeReferencia } = await import('../utils/keyboardViewport');
        _reiniciarAltoDeReferencia();
        // vertical, sin teclado: aprende 844 para ancho 390
        let win = { innerWidth: 390, innerHeight: 844, visualViewport: { height: 844, offsetTop: 0 } };
        expect(medirTecladoDeVentana(win).abierto).toBe(false);
        // giro a horizontal: alto 390 para ancho 844. Un máximo GLOBAL diría kb=454 → «teclado».
        win = { innerWidth: 844, innerHeight: 390, visualViewport: { height: 390, offsetTop: 0 } };
        expect(medirTecladoDeVentana(win)).toEqual({ kb: 0, layoutInset: 0, abierto: false, documentoEncoge: false });
        // teclado en horizontal (encoge a 200): se detecta contra el 390 de SU ancho
        win = { innerWidth: 844, innerHeight: 200, visualViewport: { height: 200, offsetTop: 0 } };
        expect(medirTecladoDeVentana(win).abierto).toBe(true);
        // vuelta a vertical: la referencia de 390 de ancho sigue siendo 844
        win = { innerWidth: 390, innerHeight: 508, visualViewport: { height: 508, offsetTop: 0 } };
        expect(medirTecladoDeVentana(win).kb).toBe(336);
    });
});
