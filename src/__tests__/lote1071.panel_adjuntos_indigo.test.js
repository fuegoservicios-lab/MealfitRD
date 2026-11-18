/**
 * [P1-PLAN-LOTE-1071 · 2026-11-17] El panel «Galería / Cámara» del chat, como un botón secundario: tinte índigo e
 * icono índigo en las dos opciones (antes, degradados propios índigo→violeta y rosa→ámbar).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CSS = readFileSync(resolve(process.cwd(), 'src/components/agent/AttachmentInlinePanel.css'), 'utf8');

describe('[1071] panel de adjuntos', () => {
    it('sin degradados ni colores sueltos: índigo por token', () => {
        expect(CSS).not.toMatch(/linear-gradient/);
        expect(CSS).not.toMatch(/#[0-9a-f]{3,8}\b/i);
        const ico = CSS.slice(CSS.indexOf('.attach-inline-ico {'), CSS.indexOf('}', CSS.indexOf('.attach-inline-ico {')));
        expect(ico).toContain('color: var(--primary)');
        expect(ico).toContain('var(--radius-md)');
    });
});
