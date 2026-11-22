/**
 * [P1-PLAN-LOTE-1161 · 2026-11-22] La hoja de rangos por puntos: rango con división, camino a la siguiente, cómo se
 * ganan los puntos, la racha que multiplica (con el tramo actual y el siguiente) y los escudos.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { EscaleraDeRangos } from '../components/dashboard/EscaleraDeRangos';

const abrir = (props) => render(<EscaleraDeRangos abierta onCerrar={() => {}} estrellas={0} semanasCerradas={0} {...props} />);

describe('[1161] hoja de rangos por puntos', () => {
    it('Plata II con 1.200 pts ([1163] IV→I): camino a Plata I, marcas personales y la escalera con sus divisiones', () => {
        abrir({ puntos: 1200, racha: 9, escudos: 1, mejorRacha: 14, recordDia: 58 });
        expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Plata II');
        expect(screen.getByText('Camino a Plata I')).toBeInTheDocument();
        expect(screen.getByText('Te faltan 150 pts')).toBeInTheDocument();
        expect(screen.getByText('Mejor racha: 14 días')).toBeInTheDocument();
        expect(screen.getByText('Récord del día: 58 pts')).toBeInTheDocument();
        const escalera = screen.getByRole('list', { name: 'Los rangos' });
        const actual = within(escalera).getAllByRole('listitem').find((li) => li.getAttribute('aria-current') === 'step');
        expect(actual.textContent).toContain('Plata');
        expect(within(escalera).getByText(/Faltan 420 pts/)).toBeInTheDocument();      // Oro desde 1.620
    });

    it('cómo ganar puntos (sin agua si está apagada) y la racha con su siguiente tramo', () => {
        abrir({ puntos: 100, racha: 9, escudos: 2, aguaEncendida: false });
        expect(screen.getByText('Proteína (70% +5 · 90% +10)')).toBeInTheDocument();
        expect(screen.queryByText('Tu agua del día')).toBeNull();
        expect(screen.getByText('5 días más registrando y ganas ×1.45.')).toBeInTheDocument();
        expect(screen.getByText(/Cada 7 días seguidos ganas un escudo/)).toBeInTheDocument();
    });

    it('Diamante I con los puntos de Maestro ([1163]), próximo hito y días para el siguiente escudo', () => {
        abrir({ puntos: 20000, racha: 33, escudos: 1 });
        expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Diamante I');
        expect(screen.getByText('Camino a Maestro')).toBeInTheDocument();
        expect(screen.getByText('Ya tienes los puntos de Maestro')).toBeInTheDocument();
        expect(screen.getByText(/Racha de leyenda: tus puntos valen ×1\.6\./)).toBeInTheDocument();
        expect(screen.getByText(/Próximo hito: 50 días\./)).toBeInTheDocument();
        expect(screen.getByText(/Te faltan 2 días para otro escudo\./)).toBeInTheDocument();
    });

    it('sin puntos (servidor viejo) sigue la hoja de estrellas', () => {
        abrir({ estrellas: 12 });
        expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Plata');
    });
});
