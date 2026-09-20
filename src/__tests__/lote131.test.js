// [P1-PLAN-LOTE-131 · 2026-09-19] Coreografía del teclado SOLO con `transform` (modo de prueba: `/fluido`).
//
// El dueño, con los avisos nativos ya en marcha: «sigue igual cuando selecciono una foto, no es 100 % fluido… lo siento
// lento el teclado cuando lo abro». Se animaban `height` y `padding-bottom` (layout por fotograma, en un hilo principal que
// al volver del selector está decodificando la foto). Ahora, con el modo encendido: transform (GPU) + UN cambio de layout.
//
// MEDIDO en el arnés (`agente.html?nativa=1`, teclado de 335 px): relevo de la apertura 0,2 px · cierre 0,2 px · la caja
// vuelve a su sitio exacto · reabrir a mitad de cierre no deja piezas con transform. Y dos fallos cazados ahí, anclados abajo.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
    CLAVE_COREOGRAFIA, KB_PAD_ABIERTO_REM, alternarCoreografia, coreografiaEncendida, listaAcompana, recorridoDelTeclado,
} from '../utils/keyboardChoreography';

const leer = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8').replace(/\r\n/g, '\n');
const ap = leer('src/pages/AgentPage.jsx');

describe('lote 131 · las piezas puras', () => {
    beforeEach(() => localStorage.removeItem(CLAVE_COREOGRAFIA));

    it('nació como modo de PRUEBA apagado; desde el lote 138 viene ENCENDIDO y `/fluido` lo alterna', () => {
        expect(coreografiaEncendida()).toBe(true);
        expect(alternarCoreografia()).toBe(false);
        expect(coreografiaEncendida()).toBe(false);
        expect(alternarCoreografia()).toBe(true);
        expect(localStorage.getItem(CLAVE_COREOGRAFIA)).toBeNull();
    });

    it('el recorrido NO es el alto del teclado: se le resta la reserva de la barra de pestañas que la caja suelta', () => {
        // medido: teclado 335, relleno cerrado 86,6 → abierto 17,6 ⇒ la caja sube 266, no 335
        expect(recorridoDelTeclado({ inset: 335, padCerrado: 86.6, padAbierto: 17.6 })).toBe(266);
        expect(recorridoDelTeclado({ inset: 335, padCerrado: 17.6, padAbierto: 17.6 })).toBe(335);
        expect(recorridoDelTeclado({ inset: 40, padCerrado: 90, padAbierto: 10 })).toBe(0);
        expect(recorridoDelTeclado()).toBe(0);
    });

    it('la lista acompaña a la caja solo si está pegada al final (o va a ir): si no, su contenido no se mueve', () => {
        expect(listaAcompana({ scrollHeight: 2000, scrollTop: 1500, clientHeight: 500 })).toBe(true);
        expect(listaAcompana({ scrollHeight: 2000, scrollTop: 900, clientHeight: 500 })).toBe(false);          // leyendo arriba
        expect(listaAcompana({ scrollHeight: 2000, scrollTop: 900, clientHeight: 500, vaAlFinal: true })).toBe(true);
        expect(listaAcompana({ scrollHeight: 400, scrollTop: 0, clientHeight: 500, vaAlFinal: true })).toBe(false);   // no llena su ventana
        expect(listaAcompana({ scrollHeight: 2000, scrollTop: 1500, clientHeight: 500, overflowY: 'hidden' })).toBe(false); // virtualizada
    });

    it('el relleno «abierto» del JS es el mismo número que el de la regla CSS', () => {
        const regla = ap.slice(ap.indexOf('html[data-kb-open] .input-wrapper {'));
        const rem = Number(/padding-bottom:\s*([\d.]+)rem !important/.exec(regla.slice(0, regla.indexOf('}')))[1]);
        expect(rem).toBe(KB_PAD_ABIERTO_REM);
    });
});

describe('lote 131 · el baile', () => {
    it('solo en la app nativa, con el modo encendido y una duración conocida; si no, todo sigue como en el lote 129', () => {
        const k = ap.indexOf('const abrirConCoreografia = (contenedor, inset, vaAlFinal) => {');
        expect(ap.slice(k, k + 400)).toContain('if (!isNativeApp() || !coreografiaEncendida() || !(msVigente > 0)) return false;');
        // y cuando NO se encarga ella, el layout se escribe como siempre
        expect(ap).toMatch(/if \(!abrirConCoreografia\(contenedor, inset, [^)]+\)\) \{\s*contenedor\.style\.setProperty\('--kb-inset', `\$\{inset\}px`\);/);
    });

    it('mientras hay piezas en el aire la geometría NO escribe (además limpiaría el transform de la caja)', () => {
        const k = ap.indexOf('const updateInputPosition = (forzarMedicion = false) => {');
        expect(ap.slice(k, k + 900)).toContain('if (coreo.fase) { coreo.medirLuego = true; return; }');
    });

    it('[cazado en el arnés] la transición de las piezas va con PRIORIDAD: la hoja trae `transition … !important` en la caja', () => {
        expect(ap).toContain("el.style.setProperty('transition', ms > 0 ? `transform ${ms}ms ${CURVA_TECLADO}` : 'none', 'important');");
        expect(ap).toContain("el.style.removeProperty('transition');");
    });

    it('[cazado en el arnés] «al fotograma siguiente» tiene respaldo: rAF se para con la página oculta (el selector de fotos)', () => {
        const k = ap.indexOf('const alSiguienteFotograma = (fn) => {');
        const cuerpo = ap.slice(k, ap.indexOf('\n        };', k));
        expect(cuerpo).toContain('requestAnimationFrame(una);');
        expect(cuerpo).toContain('setTimeout(una, 60);');
        // y nadie más usa rAF a pelo dentro de la coreografía
        const baile = ap.slice(ap.indexOf('const moverPiezas = (y, ms) => {'), ap.indexOf('const anticiparApertura = (inset) => {'));
        expect(baile.split('requestAnimationFrame(').length - 1).toBe(1);
    });

    it('el relevo cierra su estado en el acto, y la transición de React se guarda UNA vez', () => {
        const k = ap.indexOf('const relevoDeApertura = (contenedor, lista, acompana) => {');
        const cuerpo = ap.slice(k, ap.indexOf('\n        };', k));
        expect(cuerpo.indexOf('acabarCoreografia();')).toBeLessThan(cuerpo.indexOf('alSiguienteFotograma('));
        expect(ap).toContain("if (coreo.transicionBase == null && contenedor.style.transition !== 'none') coreo.transicionBase = contenedor.style.transition;");
    });

    it('la barra de pestañas se va al EMPEZAR (su llave propia) y el relleno de la caja no se anima en el relevo', () => {
        const css = leer('src/components/dashboard/BottomTabBar.module.css');
        expect(css).toContain(':global(html[data-kb-abriendo]) .tabBar,\n:global(html[data-kb-open]) .tabBar {');
        expect(ap).toMatch(/html\[data-kb-sin-anim\] \.input-wrapper \{\s*transition: none !important;/);
    });

    it('al salir del chat no quedan piezas con transform ni llaves en <html>', () => {
        const limpieza = ap.slice(ap.indexOf('// [131] la coreografia no deja piezas'));
        for (const linea of ['soltarPiezas();', "root?.removeAttribute('data-kb-abriendo');", "root?.removeAttribute('data-kb-sin-anim');", 'descongelarAlto(coreo.contenedor);']) {
            expect(limpieza.slice(0, 500)).toContain(linea);
        }
    });

    it('`/fluido` solo existe en la app nativa y no es un mensaje', () => {
        expect(ap).toContain("if (isNativeApp() && textToSend.trim().toLowerCase() === '/fluido') {");
    });
});
