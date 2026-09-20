// [P1-PLAN-LOTE-134 · 2026-09-20] ENVIAR cierra el teclado — y solo enviar.
//
// El dueño, con el chat ya a su gusto («esto está perfecto»): «quiero que cuando envíe un mensaje se cierre
// automáticamente el teclado para enfocarnos en el mensaje, eso mejoraría la experiencia de usuario».
// Historia: el lote 116 lo cerraba, el 130 lo revirtió a petición del propio dueño («haz lo mismo con el + y enviar»),
// y ahora vuelve — a sabiendas. Lo que NO vuelve: el «+», el micrófono y la X de la foto siguen sin llevarse el teclado.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ap = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/AgentPage.jsx'), 'utf-8').replace(/\r\n/g, '\n');
const i = ap.indexOf('const _tecladoVirtual = tecladoAbiertoRef.current || medirTecladoDeVentana(window).abierto;');
const bloque = ap.slice(i, i + 700);

describe('lote 134 · enviar cierra el teclado virtual', () => {
    it('solo si el foco era de la caja Y hay teclado virtual: con teclado físico se conserva el foco para seguir escribiendo', () => {
        expect(i).toBeGreaterThan(-1);
        expect(bloque).toContain('const _cierraTeclado = Boolean(_hadFocusPreSend && _tecladoVirtual);');
        expect(bloque).toMatch(/if \(_cierraTeclado\) \{\s*try \{ chatInputRef\.current\?\.blur\(\); \} catch \(_e\) \{[^}]*\}\s*(\/\/[^\n]*\n\s*)*\} else if \(_hadFocusPreSend && !callModeRef\.current\) \{/);
    });

    it('el foco se suelta DESPUÉS de capturar el texto (el blur va tras `setInput(\'\')`, no en el gesto)', () => {
        const k = ap.indexOf('const userMsg = textToSend.trim();');
        expect(k).toBeGreaterThan(-1);
        expect(k).toBeLessThan(i);
        expect(ap.indexOf("setInput('');", k)).toBeLessThan(i);
    });

    it('con el teclado cerrado el mensaje enviado se ancla arriba; «abajo» queda para el teclado que NO se cierra y para las fotos', () => {
        expect(ap).toMatch(/\} else if \(_tecladoVirtual && !_cierraTeclado\) \{[\s\S]{0,700}_setMode\('bottom'\);\s*\} else \{[\s\S]{0,300}_setMode\('anchored'\);/);
        // el ancla recupera el alto que gana la ventana al cerrarse el teclado (lote 116): sin esto el mensaje queda a media pantalla
        expect(ap).toContain('} else if (ventanaCambio && spacerPxRef.current > 0) {');
    });

    it('solo ENVIAR: el «+» y el gesto de los botones siguen sin quitarle el foco a la caja (lotes 111 y 130)', () => {
        expect(ap).toContain("onTouchEnd={handleComposerTouchEnd('attachment')}");
        expect(ap.split('onMouseDown={keepComposerFocus}').length - 1).toBe(2);
        expect(ap).toContain('if (abierto && !isNativeApp()) chatInputRef.current?.blur();');
    });
});
