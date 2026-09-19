// [P1-PLAN-LOTE-114 · 2026-09-19] El teclado del chat en la app nativa, con la secuencia MEDIDA en el iPhone del dueño:
// el WebView encoge `innerHeight` unos fotogramas al abrir el teclado y lo restaura sin evento. Leído como «el
// documento ya encogió» dejaba el inset en 0 y la caja de escribir tapada hasta el asiento (~750 ms), o para siempre.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { medirTecladoDeVentana, resolverInsetNativo, _reiniciarAltoDeReferencia } from '../utils/keyboardViewport';

const ventana = (H, vvH, S = 0) => ({ innerHeight: H, innerWidth: 390, visualViewport: { height: vvH, offsetTop: S } });

beforeEach(() => _reiniciarAltoDeReferencia());

describe('la secuencia medida (844 → 441 → 844)', () => {
    it('el parpadeo de innerHeight NO deja el inset nativo en 0', () => {
        medirTecladoDeVentana(ventana(844, 844)); // reposo: aprende la referencia
        const estable = medirTecladoDeVentana(ventana(844, 441));
        expect(estable).toMatchObject({ kb: 403, layoutInset: 403, abierto: true, documentoEncoge: false });
        const parpadeo = medirTecladoDeVentana(ventana(441, 441));
        // así lo leía el camino común: «el documento ya encogió» ⇒ 0, y la caja quedaba tapada
        expect(parpadeo).toMatchObject({ kb: 403, layoutInset: 0, abierto: true, documentoEncoge: true });
        // en nativo el inset sale del teclado, no de lo que diga innerHeight ese fotograma
        expect(resolverInsetNativo({ kb: parpadeo.kb, vvOffsetTop: 0 })).toBe(403);
        expect(resolverInsetNativo({ kb: estable.kb, vvOffsetTop: 0 })).toBe(403);
    });
    it('descuenta el paneo y nunca es negativo', () => {
        expect(resolverInsetNativo({ kb: 403, vvOffsetTop: 164 })).toBe(239);
        expect(resolverInsetNativo({ kb: 100, vvOffsetTop: 300 })).toBe(0);
        expect(resolverInsetNativo()).toBe(0);
    });
});

describe('el chat lo usa solo en nativo', () => {
    const src = readFileSync(join(__dirname, '..', 'pages', 'AgentPage.jsx'), 'utf8');
    it('inset nativo, sin «forzar» por documentoEncoge, y alto base fijo mientras hay teclado', () => {
        expect(src).toContain('const insetMedido = nativo ? resolverInsetNativo({ kb, vvOffsetTop: vv.offsetTop }) : layoutInset;');
        expect(src).toContain('const encogeDeVerdad = nativo ? false : documentoEncoge;');
        expect(src).toContain('forzar: forzarMedicion || encogeDeVerdad,');
        expect(src).toContain('layoutInset: insetMedido,');
        expect(src).toMatch(/if \(abierto && window\.innerWidth <= 1024\) \{\s*contenedor\.style\.setProperty\('--app-height', `\$\{altoDeReferencia\(window\.innerHeight, window\.innerWidth\)\}px`\);\s*\} else \{\s*contenedor\.style\.removeProperty\('--app-height'\);/);
    });
    it('re-mide cuando la VENTANA cambia de alto (la vuelta del parpadeo no trae evento del visual viewport)', () => {
        expect(src).toContain("window.addEventListener('resize', alEvento);");
        expect(src).toContain("window.removeEventListener('resize', alEvento);");
    });
    it('al salir de la ruta no queda el alto fijado', () => {
        const i = src.indexOf('const resetViewportState = () => {');
        expect(src.slice(i, i + 700)).toContain("contenedor.style.removeProperty('--app-height');");
    });
});
