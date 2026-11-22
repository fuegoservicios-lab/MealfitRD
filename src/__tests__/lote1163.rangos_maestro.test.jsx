/**
 * [P1-PLAN-LOTE-1163 · 2026-11-22] Rangos como en los videojuegos (Bronce IV la entrada, Bronce I la cima del rango),
 * la hoja que explica cómo se sube y MAESTRO: el rango especial con tres requisitos.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { EscaleraDeRangos } from '../components/dashboard/EscaleraDeRangos';
import CierreDeSemana from '../components/dashboard/CierreDeSemana';
import { maestroProgreso, nombreDelRango, rangoDelJugador } from '../utils/juegoPuntos';

const t = (s, v = {}) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
const abrir = (props) => render(<EscaleraDeRangos abierta onCerrar={() => {}} estrellas={0} semanasCerradas={0} {...props} />);

describe('[1163] divisiones IV → I', () => {
    it('la entrada de cada rango es la IV y la cima la I', () => {
        expect([540, 810, 1080, 1350].map((p) => nombreDelRango('plata', rangoDelJugador(p).division, t)))
            .toEqual(['Plata IV', 'Plata III', 'Plata II', 'Plata I']);
        expect(nombreDelRango('maestro', null, t)).toBe('Maestro');
    });

    it('la escalera pinta las divisiones de izquierda a derecha IV III II I y marca la tuya', () => {
        abrir({ puntos: 1200, racha: 3 });
        const escalera = screen.getByRole('list', { name: 'Los rangos' });
        const plata = within(escalera).getByLabelText('Divisiones de Plata, de la IV a la I');
        expect([...plata.children].map((c) => c.textContent)).toEqual(['IV', 'III', 'II', 'I']);
        expect(within(plata).getByText('II').className).toMatch(/divisionAqui/);
    });
});

describe('[1163] la hoja enseña cómo se sube', () => {
    it('tres pasos, el ritmo y el bono de semana perfecta', () => {
        abrir({ puntos: 1200, racha: 9, diasJugados: 40 });
        const pasos = screen.getByRole('list', { name: 'Cómo se sube' });
        expect(within(pasos).getAllByRole('listitem')).toHaveLength(3);
        expect(within(pasos).getByText('Baja de IV a I')).toBeInTheDocument();
        // 1.200 pts en 40 días = 30 al día; faltan 150 para Plata I ⇒ 5 días
        expect(screen.getByText('A tu ritmo (unos 30 pts al día) llegas en unos 5 días.')).toBeInTheDocument();
        expect(screen.getByText('Bono por semana perfecta (3★)')).toBeInTheDocument();
        expect(screen.getByText('+30')).toBeInTheDocument();
    });
});

describe('[1163] Maestro', () => {
    it('bloqueado: los tres requisitos con lo que llevas y cuántos tienes', () => {
        abrir({ puntos: 1233, mejorRacha: 33, maestro: maestroProgreso(1233, 2, 33) });
        expect(screen.getByText('Muy difícil: necesitas las tres cosas.')).toBeInTheDocument();
        expect(screen.getByText('1,233 / 18,900')).toBeInTheDocument();
        expect(screen.getByText('2 / 8')).toBeInTheDocument();
        expect(screen.getByText('33 / 100')).toBeInTheDocument();
        expect(screen.getByText('0 de 3')).toBeInTheDocument();
    });

    it('conseguido: título Maestro, rango especial y la escalera completa', () => {
        const rango = rangoDelJugador(19500, 9, 120);
        abrir({ puntos: 19500, mejorRacha: 120, rango, maestro: maestroProgreso(19500, 9, 120) });
        expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Maestro');
        expect(screen.getByText('Llegaste a Maestro, el rango más difícil. Es tuyo para siempre.')).toBeInTheDocument();
        const escalera = screen.getByRole('list', { name: 'Los rangos' });
        const actual = within(escalera).getAllByRole('listitem').find((li) => li.getAttribute('aria-current') === 'step');
        expect(actual.textContent).toContain('Maestro');
    });

    it('el aviso de Maestro sale con su corona', () => {
        render(<CierreDeSemana userId="u-1" eventos={[{ clave: 'maestro', codigo: 'maestro', datos: { clave: 'maestro' } }]} />);
        expect(screen.getByText('¡Eres Maestro!')).toBeInTheDocument();
    });
});
