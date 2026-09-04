// [P2-CHAT-ATTACHMENT-THUMB · 2026-09-04] La miniatura adjunta del chat llevaba una X roja de 44 px
// pegada a la esquina («se ve demasiado grande, muy feo»). Chip de cierre de 22 px, oscuro, rojo
// solo al pasar, con el área táctil de 44 px en un pseudo-elemento; miniatura con marco y sombra.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(resolve(process.cwd(), 'src/pages/AgentPage.jsx'), 'utf8').split(String.fromCharCode(13)).join('');

describe('miniatura adjunta del chat', () => {
    it('chip de cierre pequeño con área táctil invisible de 44 px', () => {
        const i = SRC.indexOf('.attachment-remove {');
        const block = SRC.slice(i, SRC.indexOf('.attachment-remove:disabled', i));
        expect(block).toMatch(/width:\s*22px;[\s\S]*height:\s*22px;/);
        expect(block).toContain('background: rgba(15, 23, 42, 0.92);');
        expect(block).toContain('.attachment-remove::after');
        expect(block).toContain('inset: -11px;');
        expect(block).toContain('background: var(--danger-fill, #dc2626);');
        expect(SRC).not.toMatch(/\.attachment-remove \{[\s\S]{0,300}width:\s*44px/);
    });
    it('la miniatura lleva marco, sombra y el icono X pequeño', () => {
        const i = SRC.indexOf('.attachment-preview {');
        const block = SRC.slice(i, i + 500);
        expect(block).toContain('box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);');
        expect(SRC).toContain('<X size={12} strokeWidth={2.75} aria-hidden="true" />');
    });
});
