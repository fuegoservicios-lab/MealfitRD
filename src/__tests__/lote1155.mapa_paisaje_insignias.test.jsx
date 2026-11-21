/**
 * [P1-PLAN-LOTE-1155 · 2026-11-21] El mapa, segunda mano de diseño (el dueño: «mejoremos el mapa en general, el diseño»).
 *
 *  1. El paisaje (`adornosDelMapa`): un adorno cada dos días, en el lado CONTRARIO al nivel, nunca junto a hoy, y el
 *     mismo dibujo en cada llamada (no cambia al repintar).
 *  2. Cada nivel enseña SIEMPRE su número de día; el estado va en una insignia (✓ / ↓ / ↑), y el pie dice solo el día
 *     de la semana (ya no repite la fecha).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { armarMapa, filasDelMapa, adornosDelMapa } from '../utils/mapaDeNiveles';
import MapaDeNiveles from '../components/dashboard/MapaDeNiveles';

const HOY = '2026-11-20';
const ESTADOS = { '2026-11-19': 'green', '2026-11-18': 'under', '2026-11-17': 'over', '2026-11-16': 'green' };
const estadoDe = (iso) => ESTADOS[iso] || null;

describe('el paisaje del mapa', () => {
    const mapa = armarMapa({ inicioISO: '2026-11-01', hoyISO: HOY, estadoDe });
    const { filas } = filasDelMapa(mapa.semanas);
    const adornos = adornosDelMapa(filas);

    it('un adorno cada dos días, en el lado contrario al nivel y nunca en la fila de hoy', () => {
        const dias = filas.filter((f) => f.tipo === 'dia');
        expect(adornos.length).toBeGreaterThan(0);
        expect(adornos.length).toBeLessThanOrEqual(Math.ceil(dias.length / 2));
        adornos.forEach((a) => {
            const fila = filas.find((f) => `a-${f.clave}` === a.clave);
            expect(fila.tipo).toBe('dia');
            expect(fila.dia.esHoy).toBe(false);
            if (fila.x >= 50) expect(a.x).toBeLessThan(30);
            else expect(a.x).toBeGreaterThan(70);
        });
    });

    it('es un dibujo fijo: la misma entrada da los mismos adornos', () => {
        expect(adornosDelMapa(filas)).toEqual(adornos);
        expect(new Set(adornos.map((a) => a.tipo)).size).toBeGreaterThan(1);
        expect(adornosDelMapa([])).toEqual([]);
    });
});

describe('los niveles', () => {
    it('el número del día siempre a la vista, el estado en una insignia y el pie sin repetir la fecha', () => {
        const { container } = render(
            <MapaDeNiveles inicioISO="2026-11-15" hoyISO={HOY} selected={HOY} estadoDe={estadoDe} onElegir={vi.fn()} />,
        );
        const enMeta = screen.getByRole('button', { name: /jueves, 19 de noviembre/i });
        expect(enMeta.textContent).toContain('19');
        expect(enMeta.querySelector('[class*="insignia_meta"]')).not.toBeNull();
        expect(screen.getByRole('button', { name: /miércoles, 18 de noviembre/i }).querySelector('[class*="insignia_bajo"]')).not.toBeNull();
        expect(screen.getByRole('button', { name: /martes, 17 de noviembre/i }).querySelector('[class*="insignia_sobre"]')).not.toBeNull();
        // hoy sin registro: sin insignia
        expect(screen.getByRole('button', { name: /viernes, 20 de noviembre/i }).querySelector('[class*="insignia"]')).toBeNull();
        const pies = [...container.querySelectorAll('[class*="nivelPie"]')].map((n) => n.textContent);
        expect(pies).toContain('Hoy');
        pies.filter((p) => p !== 'Hoy').forEach((p) => expect(p).not.toMatch(/\d/));
        // la leyenda lleva las mismas insignias
        expect(container.querySelectorAll('[class*="leyendaPunto"] svg').length).toBe(3);
    });
});
