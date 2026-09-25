/**
 * [P1-PLAN-LOTE-306 · 2026-09-25] El teclado del chat sin recálculo de estilos de TODA la página.
 *
 * Medido en el chat real (arnés, 80 mensajes, 2 650 nodos, CPU ×4): al abrir se perdían 21-26 fotogramas. No era el
 * JavaScript sino tres escrituras que obligaban al navegador a recalcular el estilo de cada nodo:
 *   · `--kb-ms` en <html>: 97 ms (una variable CSS se hereda: cambiarla en la raíz toca los 2 650 nodos) — y otra vez
 *     al retirarla, justo al acabar la animación;
 *   · `--kb-inset` en el contenedor del chat: 57 ms (lo heredaban todos los mensajes, y no lo usa ninguno);
 *   · `alAbrirTecladoRef` leía scrollHeight/scrollTop/clientHeight justo DESPUÉS de escribir `--app-height`:
 *     layout forzado de 82 ms en el primer fotograma de la subida.
 * Las variables se registran NO heredables (`@property … inherits: false`) y se escriben en cada pieza que anima
 * (marcadas `data-kb-anima`); la decisión de scroll usa medidas tomadas donde ya estaban frescas (scroll y
 * ResizeObserver). Un atributo en <html> (`data-kb-open`) sigue siendo barato: 1 ms, medido.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const leer = (rel) => readFileSync(resolve(__dirname, '..', '..', rel), 'utf8');
const ap = leer('src/pages/AgentPage.jsx');

describe('[306] variables del teclado no heredables', () => {
    const css = leer('src/index.css');
    it.each(['--kb-inset', '--kb-ms'])('%s se registra con inherits: false', (v) => {
        const m = css.match(new RegExp(`@property ${v} \\{([^}]*)\\}`));
        expect(m, `falta @property ${v}`).toBeTruthy();
        expect(m[1]).toMatch(/inherits:\s*false/);
        expect(m[1]).toMatch(/syntax:\s*'\*'/);      // sin valor inicial: `var(--kb-ms, 0.25s)` sigue cayendo al respaldo
    });

    it('--app-height NO se registra: el contenedor del dashboard lo hereda de <html> en escritorio', () => {
        expect(css).not.toMatch(/@property --app-height/);
    });
});

describe('[306] la duración del teclado va en las piezas que animan, no en <html>', () => {
    const k = ap.indexOf('const fijarDuracionTeclado = (ms) => {');
    const cuerpo = ap.slice(k, ap.indexOf('\n        };', k));

    it('fijarDuracionTeclado escribe en [data-kb-anima] y nunca en la raíz', () => {
        expect(ap).toContain("const piezasQueAnimanAlTeclado = () => document.querySelectorAll('[data-kb-anima]');");
        expect(ap).toContain("piezasQueAnimanAlTeclado().forEach((el) => el.style.removeProperty('--kb-ms'))");
        expect(cuerpo).toContain("piezasQueAnimanAlTeclado().forEach((el) => el.style.setProperty('--kb-ms', `${ms}ms`));");
        expect(cuerpo).not.toContain("root.style.setProperty('--kb-ms'");
    });

    it('las tres piezas llevan la marca: contenedor del chat, caja de escribir y barra de pestañas', () => {
        const cont = ap.slice(ap.indexOf('<div className="agent-container"'), ap.indexOf('<div className="agent-container"') + 200);
        expect(cont).toContain('data-kb-anima');
        const caja = ap.slice(ap.indexOf('ref={inputWrapperRef}') - 200, ap.indexOf('ref={inputWrapperRef}') + 200);
        expect(caja).toContain('data-kb-anima');
        expect(leer('src/components/dashboard/BottomTabBar.jsx')).toMatch(/<nav ref=\{navRef\}[^>]*data-kb-anima/);
    });

    it('al salir de la ruta se limpia en las mismas piezas', () => {
        expect(ap).not.toContain("root?.style.removeProperty('--kb-ms')");
    });
});

describe('[306] abrir el teclado no fuerza layout', () => {
    const k = ap.indexOf('alAbrirTecladoRef.current = () => {');
    const cuerpo = ap.slice(k, ap.indexOf('\n    };', k));

    it('la decisión de scroll usa las medidas guardadas, no lee el DOM', () => {
        expect(cuerpo).toContain('metricasScrollRef.current');
        expect(cuerpo).not.toMatch(/el\?\.scrollHeight|el\?\.scrollTop|el\?\.clientHeight/);
    });

    it('las medidas se guardan donde ya están frescas: al hacer scroll y en el ResizeObserver', () => {
        expect(ap.split('metricasScrollRef.current = {').length - 1).toBeGreaterThanOrEqual(2);
    });
});
