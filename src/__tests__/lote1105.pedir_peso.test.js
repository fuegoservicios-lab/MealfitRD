// [P1-PLAN-LOTE-1105 · 2026-11-18] «Quiero que también me pida cambiar el peso cada cierto tiempo, ej. cada 2 semanas.»
// Y [P1-PLAN-LOTE-1104]: la cifra de gramos centrada en su pastilla (el punteado caía en el fondo, lejos del número).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const leer = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8').replace(/\r\n/g, '\n');
const S = leer('src/pages/Settings.jsx');
const CSS = leer('src/components/dashboard/FichaDeComida.module.css');

describe('lote 1105 · cada cuánto te pide el peso', () => {
    it('cuatro opciones; ausente ⇒ cada 2 semanas', () => {
        for (const v of ['7', '14', '30', '0']) expect(S).toContain(`<option value="${v}">`);
        expect(S).toContain('return [0, 7, 14, 30].includes(v) ? v : 14;');
    });

    it('guarda SOLO su clave en el perfil (el cron del servidor lee lo mismo) y revierte si falla', () => {
        const i = S.indexOf('const cambiarFrecuenciaPeso');
        const cuerpo = S.slice(i, i + 1400);
        expect(cuerpo).toContain('body: JSON.stringify({ health_profile: { aviso_peso_dias: dias } }),');
        expect(cuerpo).toContain('setAvisoPesoDias(antes);');
    });
});

describe('lote 1104 · la cifra de gramos', () => {
    it('centrada, con el punteado pegado al número (subrayado) y no como borde del botón', () => {
        const i = CSS.indexOf('.gramosValor {');
        const regla = CSS.slice(i, CSS.indexOf('}', i));
        expect(regla).toContain('align-items: center;');
        expect(regla).toContain('text-decoration: underline dashed');
        expect(regla).not.toContain('border-bottom');
    });
});
