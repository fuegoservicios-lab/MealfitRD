// [P1-PLAN-LOTE-1179 · 2026-11-27] Portada del coach en el teléfono: centrada, tarjetas con etiqueta corta, asa discreta.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { atajosDelChat } from '../utils/atajosDelChat';
import { PortadaAtajos } from '../components/agent/PortadaDelCoach';

const t = (s, v) => (v ? s.replace(/\{(\w+)\}/g, (_, k) => v[k]) : s);
const leer = (p) => readFileSync(resolve(__dirname, p), 'utf8');

describe('lote 1179', () => {
    it('la portada se centra en el teléfono (márgenes automáticos a los dos lados)', () => {
        expect(leer('../pages/AgentPage.jsx')).toContain('.agent-container[data-portada] .msg-log { margin-bottom: auto !important; }');
    });

    it('etiqueta corta en la tarjeta del teléfono; el mensaje al coach sigue siendo el largo', () => {
        const atajos = atajosDelChat({ hora: 13, modoContador: true, metas: { protein: 135 }, totales: { protein: 0 }, comidas: [], t });
        const almuerzo = atajos.find((a) => a.id === 'almuerzo');
        expect(almuerzo.mensaje).toBe('¿Qué almuerzo me conviene hoy?');
        expect(almuerzo.corto).toBe('Idea de almuerzo');
        const informe = atajos.find((a) => a.id === 'informe');
        expect(informe.corto).toBe('Informe médico');

        const { unmount } = render(<PortadaAtajos atajos={atajos} compacto />);
        expect(screen.getByText('Idea de almuerzo')).toBeTruthy();
        expect(screen.getByText('Informe médico')).toBeTruthy();
        unmount();
        render(<PortadaAtajos atajos={atajos} />);                     // PC: el texto completo
        expect(screen.getByText('¿Qué almuerzo me conviene hoy?')).toBeTruthy();
    });

    it('el asa de la barra, discreta en oscuro', () => {
        const css = leer('../components/dashboard/BottomTabBar.module.css');
        const i = css.indexOf(':global(html[data-theme="dark"]) .asaLengua {');
        const regla = css.slice(i, css.indexOf('}', i));
        expect(regla).toContain('box-shadow: none;');
        expect(regla).toContain('color: var(--text-muted);');
    });
});
