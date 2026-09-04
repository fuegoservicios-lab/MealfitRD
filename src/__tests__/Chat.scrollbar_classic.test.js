// [P2-CHAT-SCROLLBAR-CLASSIC · 2026-09-04] El chat y la barra lateral llevaban un pulgar de 6 px
// sobre pista transparente (invisible en oscuro, sin flechas). Ahora: barra clásica de 12 px con
// pista visible, pulgar siempre visible y botones de subir/bajar con triángulo SVG.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(resolve(process.cwd(), 'src/pages/AgentPage.jsx'), 'utf8').split(String.fromCharCode(13)).join('');

describe('scrollbar clásica del chat', () => {
    it('12 px, pista visible, pulgar redondeado y flechas en los extremos', () => {
        expect(SRC).toContain('html .sidebar-scrollable::-webkit-scrollbar, html .messages-container::-webkit-scrollbar {\n                    width: 12px;');
        expect(SRC).toContain('::-webkit-scrollbar-button:vertical:decrement');
        expect(SRC).toContain('::-webkit-scrollbar-button:vertical:increment');
        expect(SRC).toMatch(/scrollbar-button \{\s*display: block;\s*height: 14px;/);
        expect(SRC).toContain("scrollbar-color: rgba(148, 163, 184, 0.7) rgba(148, 163, 184, 0.12);");
        expect(SRC).not.toContain('.messages-container::-webkit-scrollbar {\n                    width: 6px;');
    });
});
