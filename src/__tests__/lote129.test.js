// [P1-PLAN-LOTE-129 · 2026-09-19] El chat se mueve A LA VEZ que el teclado: hace caso al aviso nativo de UIKit.
//
// MEDIDO con la sonda en el iPhone del dueño (build 16), al volver del selector de fotos con el teclado abierto:
//     +5383 N+335·400   ← el teclado EMPIEZA a subir (335 px, 400 ms)
//     +5560 resize      ← la web se entera 177 ms después: la caja lleva 177 ms tapada
//     +5812 altoFin     ← y sube en 250 ms, a otro ritmo que el teclado (que tarda 400)
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { decidirAvisoNativo, KB_MS_MAX, KB_MS_MIN, KB_UMBRAL_PX } from '../utils/keyboardViewport';

const leer = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8').replace(/\r\n/g, '\n');

describe('lote 129 · qué hacer con un aviso nativo del teclado', () => {
    it('la secuencia MEDIDA al volver del selector de fotos: abre 308 → (aviso sin animación) → abre 335', () => {
        const H = 844;
        expect(decidirAvisoNativo({ tipo: 'abre', alto: 308, ms: 383, innerHeight: H })).toEqual({ accion: 'abrir', inset: 308, ms: 383 });
        expect(decidirAvisoNativo({ tipo: 'cierra', alto: 0, ms: 0, innerHeight: H }).accion).toBe('ignorar');
        expect(decidirAvisoNativo({ tipo: 'abre', alto: 335, ms: 400, innerHeight: H })).toEqual({ accion: 'abrir', inset: 335, ms: 400 });
    });

    it('un cierre animado se atiende (el alto que trae es el del teclado que se va: no se usa)', () => {
        expect(decidirAvisoNativo({ tipo: 'cierra', alto: 335, ms: 383, innerHeight: 844 })).toEqual({ accion: 'cerrar', ms: 383 });
    });

    it('un alto no creíble se ignora: la barra de un teclado físico, o más del 70 % de la pantalla', () => {
        expect(decidirAvisoNativo({ tipo: 'abre', alto: KB_UMBRAL_PX - 1, ms: 250, innerHeight: 844 }).accion).toBe('ignorar');
        expect(decidirAvisoNativo({ tipo: 'abre', alto: 700, ms: 250, innerHeight: 844 }).accion).toBe('ignorar');
        expect(decidirAvisoNativo({ tipo: 'otra', alto: 335, ms: 250, innerHeight: 844 }).accion).toBe('ignorar');
        expect(decidirAvisoNativo().accion).toBe('ignorar');
    });

    it('la duración se acota: ni 5 s moviéndose ni un salto de 10 ms', () => {
        expect(decidirAvisoNativo({ tipo: 'abre', alto: 335, ms: 5000, innerHeight: 844 }).ms).toBe(KB_MS_MAX);
        expect(decidirAvisoNativo({ tipo: 'cierra', ms: 10 }).ms).toBe(KB_MS_MIN);
    });
});

describe('lote 129 · el chat escucha el aviso y las TRES piezas comparten su duración', () => {
    const ap = leer('src/pages/AgentPage.jsx');

    it('se registra y se retira con el efecto del teclado, y solo actúa en la app nativa', () => {
        expect(ap).toContain('window.addEventListener(EVENTO_TECLADO_NATIVO, alTecladoNativo);');
        expect(ap).toContain('window.removeEventListener(EVENTO_TECLADO_NATIVO, alTecladoNativo);');
        const k = ap.indexOf('const alTecladoNativo = (e) => {');
        const cuerpo = ap.slice(k, ap.indexOf('\n        };', k));
        expect(cuerpo).toContain('if (!isNativeApp()) return;');
        expect(cuerpo).toContain("if (aviso.accion === 'ignorar') return;");
        // el cierre entra por la MISMA puerta que el blur; la apertura, por la misma que el foco
        expect(cuerpo).toContain('alPerderElFoco({ relatedTarget: null });');
        expect(cuerpo).toContain('anticiparApertura(aviso.inset);');
        // si el foco ya lo había colocado con ese alto, no se repite
        expect(cuerpo).toContain('if (tecladoAbiertoRef.current && insetAplicadoRef.current === aviso.inset) return;');
    });

    it('la duración real se recuerda (el foco llega unos ms antes que el aviso) y se retira al acabar', () => {
        expect(ap).toContain("const CLAVE_MS_NATIVO = 'mf_kb_ms_nativo';");
        const k = ap.indexOf('const fijarDuracionTeclado = (ms) => {');
        const cuerpo = ap.slice(k, ap.indexOf('\n        };', k));
        // [P1-PLAN-LOTE-306] ya no en <html> (recalculaba el estilo de todo el chat): en cada pieza que anima
        expect(cuerpo).toContain("piezasQueAnimanAlTeclado().forEach((el) => el.style.setProperty('--kb-ms', `${ms}ms`));");
        expect(cuerpo).toContain('quitarDuracionDelTeclado();');
        expect(ap.split('fijarDuracionTeclado(Number(safeLocalStorageGet(CLAVE_MS_NATIVO, 0)) || 0);').length - 1).toBe(2);
    });

    it('alto del chat, relleno de la caja y barra de pestañas: la misma duración', () => {
        const CURVA = 'var(--kb-ms, 0.25s) cubic-bezier(0.32, 0.72, 0, 1)';
        expect(ap.split(CURVA).length - 1).toBe(2);
        expect(leer('src/components/dashboard/BottomTabBar.module.css')).toContain(`transform ${CURVA}`);
    });

    it('abrir no decide dos veces qué pasa con la conversación', () => {
        const k = ap.indexOf('const anticiparApertura = (inset) => {');
        const cuerpo = ap.slice(k, ap.indexOf('\n        };', k));
        expect(cuerpo).toContain('const estabaAbierto = tecladoAbiertoRef.current;');
        expect(cuerpo).toContain('if (!estabaAbierto) alAbrirTecladoRef.current?.();');
    });
});
