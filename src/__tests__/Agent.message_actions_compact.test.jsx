// [P2-MSG-ACTIONS-COMPACT · 2026-09-03] → [P1-PLAN-LOTE-1061 · 2026-11-17] La fila de acciones bajo cada respuesta
// (👍 👎 🔄 copiar) se QUITÓ: el dueño, «quitar todo, para mejor experiencia» (1 👍 y 0 👎 en 1.154 respuestas en 60
// días). Copiar sigue con mantener pulsado: `.messages-container` permite seleccionar el texto.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');
const JSX = read('src/components/agent/MessageBubble.jsx');
const CSS = read('src/components/agent/MessageBubble.css');
const INDEX = read('src/index.css');

describe('sin acciones bajo el mensaje', () => {
    it('no hay fila de acciones ni sus estilos', () => {
        expect(JSX).not.toContain('msg-actions');
        expect(JSX).not.toContain('MessageActions');
        expect(JSX).not.toContain('/api/chat/feedback');
        expect(CSS).not.toContain('.msg-action-btn');
    });
    it('el texto del chat se puede seleccionar (copiar con mantener pulsado)', () => {
        expect(INDEX).toMatch(/\.messages-container, input, textarea \{[^}]*user-select: text;/);
    });
});
