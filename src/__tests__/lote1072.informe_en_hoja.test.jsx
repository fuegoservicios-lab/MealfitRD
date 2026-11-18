/**
 * [P1-PLAN-LOTE-1072 · 2026-11-17] El informe se abre en una HOJA encima del cajón del calendario (antes navegaba a
 * otra página y cerraba el cajón: el dueño lo veía «raro») y su pantalla de generar está rediseñada.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../components/common/Modal', () => ({
    default: ({ isOpen, children }) => (isOpen ? <div role="dialog">{children}</div> : null),
}));
vi.mock('../components/informe/InformeMedicoPanel', () => ({ default: () => <p>panel del informe</p> }));

import BotonInformeMedico from '../components/common/BotonInformeMedico';
import { fechasDelPeriodo } from '../components/informe/fechasDelPeriodo';

const leer = (p) => readFileSync(resolve(process.cwd(), 'src', p), 'utf8');

describe('[1072] el botón abre una hoja, no otra página', () => {
    it('tocarlo pinta el diálogo con el panel (sin router: ya no navega)', async () => {
        render(<BotonInformeMedico />);
        expect(screen.queryByRole('dialog')).toBeNull();
        fireEvent.click(screen.getByTestId('boton-informe-medico'));
        expect(screen.getByRole('dialog')).toBeTruthy();
        expect(await screen.findByText('panel del informe')).toBeTruthy();
    });

    it('el cajón del calendario ya no se cierra al abrirlo, y el botón no navega ni lleva estilos en línea', () => {
        expect(leer('components/dashboard/DiaryHistory.jsx')).not.toContain('<BotonInformeMedico onAbrir={onClose} />');
        const boton = leer('components/common/BotonInformeMedico.jsx');
        expect(boton).not.toMatch(/navigate\(|style=\{/);
    });

    it('la hoja va en un portal al <body> (el cajón se anima con transform)', () => {
        expect(leer('components/informe/HojaInformeMedico.jsx')).toContain('createPortal(');
    });
});

describe('[1072] la pantalla de generar', () => {
    it('las fechas del periodo son las del servidor: hasta = hoy, desde = hoy − (n − 1)', () => {
        expect(fechasDelPeriodo(30, new Date(2026, 10, 17))).toEqual({ desde: '2026-10-19', hasta: '2026-11-17' });
        expect(fechasDelPeriodo(14, new Date(2026, 0, 5))).toEqual({ desde: '2025-12-23', hasta: '2026-01-05' });
    });

    it('usa el botón común (índigo) y dice qué incluye; el informe listo tiene «Compartir PDF» principal', () => {
        const src = leer('components/informe/InformeMedicoPanel.jsx');
        expect(src).toContain("import Button from '../ui/Button'");
        expect(src).toContain("t('Qué incluye')");
        expect(src).toMatch(/<Button variant="primary" block onClick=\{compartir\}/);
        const css = leer('components/informe/InformeMedicoPanel.module.css');
        expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
        expect(css).toContain('.periodoActivo { background: var(--primary-fill)');
    });
});
