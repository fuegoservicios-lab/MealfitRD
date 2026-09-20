// [P1-PLAN-LOTE-127 · 2026-09-19] El micrófono no se lleva el teclado, y la caja del chat es simétrica.
//
// El dueño, ya con el build nativo que trae el micrófono: «cuando abro el teclado y prendo el micrófono se cierra el
// teclado… veo que no hay simetría en la parte izquierda donde está el signo de +».
//
//   · Teclado: iOS lo esconde al arrancar la sesión de audio SIN desenfocar el campo (la misma forma que al volver del
//     selector de fotos). Si había teclado al tocar el micrófono y, ya escuchando, la geometría dice que se fue, se
//     suelta y se retoma el foco — una sola vez. Visto en el arnés con un visualViewport falso: nada a los 350 ms
//     (seguía abierto), blur+focus a los ~740 ms, y ninguno más. DEDUCIDO para iOS, por eso deja marcas en la sonda.
//   · Simetría: medido, 28 px del borde al «+» contra 11 px del borde a ENVIAR. Ahora 11 y 11.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const leer = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8').replace(/\r\n/g, '\n');
const ap = leer('src/pages/AgentPage.jsx');

describe('lote 127 · encender el micrófono no se lleva el teclado', () => {
    it('recuerda si HABÍA teclado al tocar el micrófono (solo al encender)', () => {
        expect(ap).toContain('reponerTecladoTrasMicRef.current = Boolean(tecladoAbiertoRef.current || medirTecladoDeVentana(window).abierto);');
        expect(ap).toContain('onClick={handleMicClick}');
        expect(ap).not.toContain('onClick={dictado.alternar}');
    });

    it('ya escuchando, si la geometría dice que el teclado se fue, suelta y retoma el foco UNA vez', () => {
        const efecto = ap.slice(ap.indexOf('if (!isListening || !reponerTecladoTrasMicRef.current) return undefined;'), ap.indexOf('// lo dictado crece por abajo'));
        expect(efecto).toContain('MIC_REPONER_TECLADO_MS.map(');
        expect(efecto).toContain('if (!campo || medirTecladoDeVentana(window).abierto) return;');
        expect(efecto).toContain('relojes.forEach(clearTimeout);');
        expect(efecto).toContain('if (document.activeElement === campo) campo.blur();');
        expect(efecto).toContain('campo.focus({ preventScroll: true });');
        expect(ap).toContain('const MIC_REPONER_TECLADO_MS = [350, 700, 1200, 2000];');
    });

    it('el TOQUE no le quita el foco a la caja: se atiende en touchend y se cancela (ni parpadeo ni cierre al pausar)', () => {
        expect(ap).toContain('onTouchEnd={handleMicTouchEnd}');
        expect(ap).toContain('onMouseDown={(e) => e.preventDefault()}');
        const toque = ap.slice(ap.indexOf('const handleMicTouchEnd = (e) => {'), ap.indexOf('useEffect(() => {', ap.indexOf('const handleMicTouchEnd = (e) => {')));
        expect(toque).toContain('if (!e.cancelable) return;');
        expect(toque).toContain('e.preventDefault();');
        expect(toque).toContain('micPorToqueRef.current = Date.now();');
        expect(toque).toContain('accionarMic();');
        // y un clic que llegue del mismo gesto no alterna dos veces
        expect(ap).toContain('if (Date.now() - micPorToqueRef.current < MIC_CLIC_FANTASMA_MS) return;');
    });

    it('cada paso deja marca en la sonda del teclado, y sin sonda no cuesta nada', () => {
        const sonda = leer('src/utils/keyboardProbe.js');
        expect(sonda).toContain("export const EVENTO_MARCA_SONDA = 'mf:sonda-teclado';");
        expect(sonda).toContain("if (!_pararSonda || typeof document === 'undefined') return;");
        expect(sonda).toContain('document.addEventListener(EVENTO_MARCA_SONDA, onMarca);');
        expect(sonda).toContain('document.removeEventListener(EVENTO_MARCA_SONDA, onMarca);');
        for (const marca of ["'micKB'", "'micON'", "'kbRepon'"]) expect(ap).toContain(marca);
    });
});

describe('lote 127 · la caja del chat es simétrica', () => {
    it('relleno igual a los dos lados (ya no 16 px a la izquierda y 8 a la derecha)', () => {
        expect(ap).toContain("padding: '0.5rem',");
        expect(ap).not.toContain("'0.5rem 0.5rem 0.5rem 1rem'");
    });

    it('el «+» es un círculo visible del tamaño de ENVIAR y con su mismo margen al borde', () => {
        const css = ap.slice(ap.indexOf('.attachment-btn {'), ap.indexOf('.chat-mic-btn {'));
        expect(css).toContain('background: color-mix(in srgb, var(--text-main) 9%, transparent);');
        expect(css).toContain('margin-left: 2px;');
        expect(css).toContain('width: 44px;');
        expect(ap).toContain("marginRight: '2px'");
    });

    it('la miniatura adjunta arranca en la misma vertical que el «+»', () => {
        expect(ap).toContain('padding: 0.35rem 0.4rem 0.55rem 2px;');
    });

    it('con foto adjunta la caja se APILA: texto a todo el ancho bajo la imagen y el «+» en la fila de abajo', () => {
        expect(ap).toContain('const cajaApilada = attachments.length > 0;');
        expect(ap).toContain("flexWrap: cajaApilada ? 'wrap' : 'nowrap',");
        expect(ap).toContain("flex: cajaApilada ? '1 0 100%' : 1,");
        expect(ap).toContain('order: cajaApilada ? -1 : 0,');
        expect(ap).toContain("borderRadius: cajaApilada ? '1.75rem' : '2rem',");
        // sin mover el JSX: el input de fichero sigue dentro del span del «+» (iOS ancla ahí su menú)
        expect(ap.indexOf('ref={fileInputRef}')).toBeLessThan(ap.indexOf('ref={chatInputRef}\n                            rows={1}'));
    });

    it('ningún acento grave dentro del CSS del chat (rompe el template literal)', () => {
        const css = ap.slice(ap.indexOf('/* [P1-PLAN-LOTE-127] El «+» es un CIRCULO'), ap.indexOf('.chat-mic-btn {'));
        expect(css.length).toBeGreaterThan(100);
        expect(css).not.toContain('`');
    });
});
