// [P1-PLAN-LOTE-143 · 2026-09-20] El teclado del chat nativo vuelve a como estaba en el lote 139.
//
// Los lotes 140–142 probaron a mover el chat DESDE EL BINARIO (capturas animadas por UIKit; después, el WebView entero
// viajando con el teclado). Dos builds en el iPhone del dueño: «se medio buguea» → «mejor, pero… fallas visuales alrededor»
// → «quiero que lo dejes como estaba, ya que nada funciona». Se REVIERTEN enteros (código, Swift, Info.plist, textos): el
// árbol es byte a byte el del lote 139. Lo aprendido queda en la memoria del proyecto, no en código apagado.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const existe = (rel) => fs.existsSync(path.resolve(process.cwd(), rel));
const leer = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8').replace(/\r\n/g, '\n');

describe('lote 143 · del modo nativo no queda nada', () => {
    it('ni la utilidad, ni el cableado, ni la orden `/nativo`', () => {
        expect(existe('src/utils/keyboardNative.js')).toBe(false);
        const ap = leer('src/pages/AgentPage.jsx');
        for (const resto of ['keyboardNative', 'esperarAperturaNativa', 'esperarCierreNativo', 'atenderCoberturaNativa', 'data-kb-vuelo', '/nativo']) {
            expect(ap).not.toContain(resto);
        }
    });

    it('el binario solo AVISA del teclado (lote 128): ni captura ni mueve nada', () => {
        const swift = leer('ios/App/App/SceneDelegate.swift');
        expect(swift).not.toContain('CoberturaDelTeclado');
        expect(swift).not.toContain('WKScriptMessageHandler');
        expect(swift).toContain("new CustomEvent('mf:teclado-nativo',{detail:{tipo:'\\(tipo)',alto:\\(alto),ms:\\(ms)}})");
        expect(leer('ios/App/App/Info.plist')).not.toContain('CADisableMinimumFrameDurationOnPhone');
    });

    it('el camino de siempre sigue en su sitio: al foco, layout final + cerrojo del documento (lo que evita el paneo de iOS)', () => {
        const ap = leer('src/pages/AgentPage.jsx');
        const k = ap.indexOf('const anticiparApertura = (inset) => {');
        const cuerpo = ap.slice(k, ap.indexOf('\n        };', k));
        expect(cuerpo).toContain("contenedor.style.setProperty('--kb-inset', `${inset}px`);");
        expect(cuerpo).toContain("root.toggleAttribute('data-kb-scroll-lock', true);");
        expect(ap).toContain('anticiparApertura(recordado);');
    });
});
