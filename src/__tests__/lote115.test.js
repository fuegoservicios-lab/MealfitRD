// [P1-PLAN-LOTE-115 · 2026-09-19] El chat con el teclado abierto: el final de lo que dijo el agente queda a la vista, y
// el arrastre que paneaba la página entera (medido con la sonda) ya no despega la caja del teclado.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decidirScrollAlAbrirTeclado, decidirArrastreConTeclado, scrollerPuedeMoverse } from '../utils/chatKeyboardScroll';

describe('al abrir el teclado', () => {
    const base = { scrollHeight: 3000, clientHeight: 600, spacerPx: 0 };
    it('abajo del todo: se mantiene pegado', () => {
        expect(decidirScrollAlAbrirTeclado({ ...base, mode: 'bottom' })).toBe('fijar');
    });
    it('ANCLADO con la respuesta terminada: baja al final (el teclado tapaba la pregunta del agente)', () => {
        expect(decidirScrollAlAbrirTeclado({ ...base, mode: 'anchored', scrollTop: 1200, spacerPx: 400 })).toBe('forzar');
    });
    it('con la respuesta EN CURSO no se toca: manda el ancla', () => {
        expect(decidirScrollAlAbrirTeclado({ ...base, mode: 'anchored', streaming: true })).toBe('nada');
        expect(decidirScrollAlAbrirTeclado({ ...base, mode: 'free', streaming: true, scrollTop: 2300 })).toBe('nada');
    });
    it('libre: a menos de una pantalla del final REAL baja; leyendo historial antiguo, no', () => {
        expect(decidirScrollAlAbrirTeclado({ ...base, mode: 'free', scrollTop: 2000 })).toBe('forzar'); // faltan 400
        expect(decidirScrollAlAbrirTeclado({ ...base, mode: 'free', scrollTop: 500 })).toBe('nada');   // faltan 1900
        // el espaciador del ancla no cuenta como contenido: con 800 px de espaciador el final real está más cerca
        expect(decidirScrollAlAbrirTeclado({ ...base, mode: 'free', scrollTop: 1000, spacerPx: 800 })).toBe('forzar');
        expect(decidirScrollAlAbrirTeclado({ ...base, mode: 'free', scrollTop: 2000, virtualizada: true })).toBe('nada');
    });
});

describe('arrastre con el teclado abierto', () => {
    it('un toque no es un arrastre', () => {
        expect(decidirArrastreConTeclado({ dx: 2, dy: -3 })).toBe('esperar');
    });
    it('bloquea el vertical que nadie puede aprovechar — el que paneaba la página', () => {
        expect(decidirArrastreConTeclado({ dx: 1, dy: -20, msDesdeElToque: 85 })).toBe('bloquear');
        expect(decidirArrastreConTeclado({ dx: 1, dy: -20, msDesdeElToque: 85, enCampoDeTexto: true })).toBe('bloquear');
    });
    it('cede el horizontal (sugerencias), el de un scroller que puede moverse y el lento dentro del texto (cursor)', () => {
        expect(decidirArrastreConTeclado({ dx: 30, dy: 4 })).toBe('ceder');
        expect(decidirArrastreConTeclado({ dx: 0, dy: 25, scrollerPuede: true })).toBe('ceder');
        expect(decidirArrastreConTeclado({ dx: 0, dy: 25, msDesdeElToque: 600, enCampoDeTexto: true })).toBe('ceder');
    });
    it('scrollerPuedeMoverse mira la dirección del dedo y los bordes', () => {
        const hasta = { nodeType: 1 };
        const lista = { nodeType: 1, scrollHeight: 2000, clientHeight: 400, scrollTop: 1600, parentElement: hasta, _oy: 'auto' };
        const burbuja = { nodeType: 1, scrollHeight: 50, clientHeight: 50, scrollTop: 0, parentElement: lista, _oy: 'visible' };
        const estilo = (n) => ({ overflowY: n._oy });
        expect(scrollerPuedeMoverse(burbuja, hasta, -10, estilo)).toBe(false); // al final y el dedo sube: no queda recorrido
        expect(scrollerPuedeMoverse(burbuja, hasta, 10, estilo)).toBe(true);   // hacia arriba sí
        lista.scrollTop = 0;
        expect(scrollerPuedeMoverse(burbuja, hasta, 10, estilo)).toBe(false);
        lista._oy = 'hidden';
        expect(scrollerPuedeMoverse(burbuja, hasta, -10, estilo)).toBe(false);
    });
});

describe('el chat lo cablea', () => {
    const src = readFileSync(join(__dirname, '..', 'pages', 'AgentPage.jsx'), 'utf8');
    it('la política corre UNA vez al abrir: en la apertura anticipada y en la transición medida', () => {
        expect(src).toContain('if (abierto && !tecladoAbiertoRef.current) alAbrirTecladoRef.current?.();');
        // [P1-PLAN-LOTE-129] la apertura anticipada vive en `anticiparApertura` (la comparten el foco y el aviso nativo),
        // y allí corre solo si el teclado NO estaba ya abierto: dos avisos seguidos (308 → 335 px) no deciden dos veces.
        const i = src.indexOf('const anticiparApertura = (inset) => {');
        expect(src.slice(i, i + 1400)).toContain('if (!estabaAbierto) alAbrirTecladoRef.current?.();');
        const j = src.indexOf('const alGanarElFoco = (e) => {');
        expect(src.slice(j, j + 1200)).toContain('anticiparApertura(recordado);');
        expect(src).toContain("else if (accion === 'forzar') scrollToBottom(true, 'auto');");
    });
    it('el contenedor también se observa: el final sigue pegado mientras la ventana encoge', () => {
        expect(src).toContain('ro.observe(list);\n        ro.observe(el);'.replace(/\n/g, src.includes('\r\n') ? '\r\n' : '\n'));
        expect(src).toContain('el.scrollTop = Math.max(0, el.scrollTop + delta);');
    });
    it('el bloqueo del arrastre es solo nativo + teclado abierto, y no pasivo', () => {
        expect(src).toContain('if (!toque || !tecladoAbiertoRef.current || !isNativeApp()) return;');
        expect(src).toContain("document.addEventListener('touchmove', alMoverToque, { passive: false });");
        expect(src).toContain("document.removeEventListener('touchmove', alMoverToque);");
        expect(src).toContain("if (toque.veredicto === 'bloquear' && e.cancelable) e.preventDefault();");
    });
    it('el paneo transitorio no mueve el layout: solo se descuenta en el asiento', () => {
        expect(src).toContain('resolverInsetNativo({ kb, vvOffsetTop: forzarMedicion ? vv.offsetTop : 0 })');
    });
});
