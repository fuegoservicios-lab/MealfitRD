/**
 * [P1-PLAN-LOTE-1068 · 2026-11-17] La escalera de rangos (petición del dueño): tocar la insignia abre los cinco rangos,
 * cuántas estrellas pide cada uno y cómo llegar al siguiente, contado en semanas.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { EscaleraDeRangos } from '../components/dashboard/EscaleraDeRangos';
import { ESCALERA, posicionEnLaEscalera, semanasHasta } from '../utils/caminoDeRangos';

describe('[1068] las cuentas de la escalera', () => {
    it('los umbrales son EXACTAMENTE los del servidor (progreso_semanas.RANGOS)', () => {
        const py = readFileSync(resolve(process.cwd(), '../backend/progreso_semanas.py'), 'utf8');
        const linea = py.match(/^RANGOS = \((.*)\)$/m)[1];
        const servidor = [...linea.matchAll(/\("(\w+)",\s*(\d+)\)/g)].map((m) => ({ clave: m[1], desde: Number(m[2]) }));
        expect(servidor).toEqual(ESCALERA);
    });

    it('sitúa el rango, el siguiente, lo que falta y el avance del tramo', () => {
        expect(posicionEnLaEscalera(0)).toMatchObject({ indice: 0, faltan: 10, avance: 0 });
        expect(posicionEnLaEscalera(9)).toMatchObject({ indice: 0, faltan: 1 });
        expect(posicionEnLaEscalera(10)).toMatchObject({ indice: 1, faltan: 15, avance: 0 });
        expect(posicionEnLaEscalera(40).avance).toBeCloseTo(15 / 25);
        expect(posicionEnLaEscalera(130)).toMatchObject({ indice: 4, siguiente: null, faltan: 0, avance: 1 });
        expect(posicionEnLaEscalera(-3).indice).toBe(0);
    });

    it('el camino en semanas: perfectas (3 ★) y a tu ritmo (estrellas por semana cerrada)', () => {
        expect(semanasHasta(10)).toEqual({ perfectas: 4, aTuRitmo: null });
        expect(semanasHasta(10, { estrellas: 6, semanasCerradas: 4 })).toEqual({ perfectas: 4, aTuRitmo: 7 });
        expect(semanasHasta(0)).toEqual({ perfectas: 0, aTuRitmo: null });
    });
});

describe('[1068] la hoja', () => {
    it('con 0 estrellas: Bronce es «Estás aquí», Plata pide 10 y el ritmo espera a la primera semana', () => {
        render(<EscaleraDeRangos abierta onCerrar={() => {}} estrellas={0} semanasCerradas={0} />);
        expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Bronce');
        const actual = document.querySelector('[aria-current="step"]');
        expect(actual.textContent).toContain('Bronce');
        expect(actual.textContent).toContain('Estás aquí');
        expect(screen.getByText('Faltan 10 ★')).toBeTruthy();
        // [P1-PLAN-LOTE-1081] «Faltan N ★» solo en el siguiente rango; los lejanos dicen desde cuántas estrellas
        expect(screen.queryByText('Faltan 100 ★')).toBeNull();
        expect(screen.getByText('Desde 100 estrellas')).toBeTruthy();
        expect(screen.getByText('cierra tu primera semana para ver tu ritmo')).toBeTruthy();
        expect(screen.getByRole('progressbar').getAttribute('aria-valuemax')).toBe('10');
        expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(5);
    });

    it('con 30 estrellas: Bronce y Plata conseguidos, Oro actual, y en la cima no hay barra', () => {
        const { unmount } = render(<EscaleraDeRangos abierta onCerrar={() => {}} estrellas={30} semanasCerradas={10} />);
        expect(screen.getAllByText('Conseguido')).toHaveLength(2);
        expect(document.querySelector('[aria-current="step"]').textContent).toContain('Oro');
        unmount();
        render(<EscaleraDeRangos abierta onCerrar={() => {}} estrellas={120} semanasCerradas={40} />);
        expect(screen.queryByRole('progressbar')).toBeNull();
        expect(screen.getByText('Estás en la cima: llegaste a Diamante.')).toBeTruthy();
    });

    it('con semanas cerradas y 0 estrellas no dice «cierra tu primera semana» (sería falso)', () => {
        render(<EscaleraDeRangos abierta onCerrar={() => {}} estrellas={0} semanasCerradas={9} />);
        expect(screen.queryByText('cierra tu primera semana para ver tu ritmo')).toBeNull();
        expect(screen.getByText('con 3 días en meta en una semana ganas la primera')).toBeTruthy();
    });

    it('cerrada no pinta nada', () => {
        const { container } = render(<EscaleraDeRangos abierta={false} onCerrar={() => {}} estrellas={5} />);
        expect(container.innerHTML).toBe('');
    });
});

describe('[1068] la tarjeta la abre', () => {
    const SRC = readFileSync(resolve(process.cwd(), 'src/components/dashboard/SemanaEnProgreso.jsx'), 'utf8');
    it('la insignia y la línea del rango son botones que abren la escalera', () => {
        expect(SRC).toContain("aria-label={t('Ver los rangos y cómo subir')}");
        expect((SRC.match(/onClick=\{\(\) => setEscaleraAbierta\(true\)\}/g) || []).length).toBe(2);
        expect(SRC).toContain('<EscaleraDeRangos');
    });
    it('«Te faltan…» va en su línea, ya no detrás de un «·»', () => {
        const i = SRC.indexOf('className={styles.rangoFalta}');
        expect(SRC.slice(i, i + 200)).not.toContain("{' · '}");
    });
});
