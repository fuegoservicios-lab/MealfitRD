// [P2-MSG-ACTIONS-COMPACT · 2026-09-03] La fila de acciones bajo cada respuesta del coach iba en
// botones de 44×44 con 0,6rem de hueco (~54px de paso para iconos de 18px). Ahora: 32px y 2px de
// hueco con puntero fino; 42px donde el puntero es el dedo. Tamaño y hover viven en CSS, no inline.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');
const JSX = read('src/components/agent/MessageBubble.jsx');
const CSS = read('src/components/agent/MessageBubble.css');

describe('acciones del mensaje', () => {
    it('los cuatro botones comparten clase y el estado activo es una clase, no un estilo inline', () => {
        expect(JSX).toContain('<div className="msg-actions">');
        expect((JSX.match(/className=\{actionBtnClass\(/g) || []).length).toBe(4);
        expect(JSX).not.toContain('actionBtnStyle');
        expect(JSX).not.toContain('onMouseEnter={handleMouseEnter}');
        expect(JSX).not.toContain('minWidth: 44');
    });
    it('compacta con puntero fino, táctil con el dedo', () => {
        expect(CSS).toContain('.msg-actions {');
        expect(CSS).toMatch(/\.msg-actions \{[^}]*gap: 2px;/);
        expect(CSS).toMatch(/\.msg-action-btn \{[^}]*width: 32px;[^}]*height: 32px;/);
        expect(CSS).toContain('@media (pointer: coarse) {');
        expect(CSS).toMatch(/pointer: coarse\) \{[\s\S]*?\.msg-action-btn \{ width: 42px; height: 42px; \}/);
        expect(CSS).toContain('.msg-action-btn.is-active { color: var(--primary);');
    });
});
