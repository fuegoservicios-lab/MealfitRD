// [P2-CHAT-JUMP-TO-LATEST-DESKTOP · 2026-09-04] El botón «ir al último mensaje» solo tenía estilo en el
// bloque móvil (≤1024 px): en PC se pintaba como un <button> sin estilo estirado a todo el ancho
// («una barra rara con un punto» al scrollear arriba). Ahora vive dentro del cuadro de escribir con
// un estilo base fuera de cualquier @media.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(resolve(process.cwd(), 'src/pages/AgentPage.jsx'), 'utf8').split(String.fromCharCode(13)).join('');

describe('ir al último mensaje', () => {
    it('el estilo base está fuera de cualquier @media y es una píldora de 40 px', () => {
        const style = SRC.indexOf('<style>{`');
        const rule = SRC.indexOf('.jump-to-latest {', style);
        const media = SRC.indexOf('@media', style);
        expect(rule).toBeGreaterThan(style);
        expect(rule).toBeLessThan(media);
        const block = SRC.slice(rule, SRC.indexOf('}', rule));
        expect(block).toContain('position: absolute;');
        expect(block).toContain('top: -3rem;');
        expect(block).toContain('left: 50%;');
        expect(block).toContain('transform: translateX(-50%);');
        expect(block).toMatch(/width:\s*36px;[\s\S]*height:\s*36px;/);
        expect(block).toContain('border-radius: 999px;');
        // sin la regla móvil vieja anclada a la barra de pestañas / teclado
        expect(SRC).not.toContain('html[data-kb-open] .jump-to-latest');
        expect(SRC).not.toContain('bottom: calc(6.8rem + 64px');
    });
    it('se monta dentro del cuadro de escribir, solo en el modo pegado abajo', () => {
        const i = SRC.indexOf('const renderInputArea = ');
        const j = SRC.indexOf('className="chat-quick-chips"', i);
        const win = SRC.slice(i, j);
        expect(win).toContain('{!isCentered && showJumpToLatest && messages.length > 0 && (');
        expect(win).toContain('className="jump-to-latest"');
        expect(win).toContain("onClick={() => scrollToBottom(true, 'smooth')}");
        // y ya no como hermano suelto del contenedor de mensajes
        expect(SRC.split('className="jump-to-latest"').length - 1).toBe(1);
    });
});
