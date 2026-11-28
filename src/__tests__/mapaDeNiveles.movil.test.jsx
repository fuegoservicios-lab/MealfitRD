/**
 * [P1-MAPA-MOVIL · 2026-11-27] Mapa de niveles en el teléfono:
 *  1. Los días bloqueados van más juntos (ALTO_FUTURO), salvo el que queda justo encima de hoy (su cartel necesita aire):
 *     un jueves dejaba viernes y sábado ocupando un tercio de la ventana y lo recorrido quedaba fuera.
 *  2. Hoy, aún abierto bajo la meta, no lleva la insignia ↓ (el día no cerró) y se pinta con la marca, no en gris.
 *  3. La barra del rango enseña el avance hacia el siguiente.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ALTO_DIA, ALTO_FUTURO, armarMapa, filasDelMapa } from '../utils/mapaDeNiveles';
import { rangoPorPuntos } from '../utils/juegoPuntos';
import MapaDeNiveles from '../components/dashboard/MapaDeNiveles';

const HOY = '2026-11-26';   // jueves: quedan viernes y sábado bloqueados
const ESTADOS = { '2026-11-26': 'under', '2026-11-25': 'green', '2026-11-24': 'under' };
const estadoDe = (iso) => ESTADOS[iso] || null;

describe('mapa en el teléfono', () => {
    it('los bloqueados van más juntos, menos el que está pegado a hoy', () => {
        const { filas } = filasDelMapa(armarMapa({ inicioISO: '2026-11-15', hoyISO: HOY, estadoDe }).semanas);
        const dia = (iso) => filas.find((f) => f.tipo === 'dia' && f.dia.iso === iso);
        expect(dia('2026-11-28').alto).toBe(ALTO_FUTURO);   // sábado
        expect(dia('2026-11-27').alto).toBe(ALTO_DIA);      // viernes, justo encima de hoy
        expect(dia('2026-11-25').alto).toBe(ALTO_DIA);      // los pasados no cambian
        expect(ALTO_FUTURO).toBeLessThan(ALTO_DIA);
    });

    it('hoy abierto bajo la meta: sin insignia ↓ y con su color de nivel; un día pasado bajo la meta sí la lleva', () => {
        render(
            <MapaDeNiveles inicioISO="2026-11-15" hoyISO={HOY} selected={HOY} estadoDe={estadoDe}
                porFecha={new Map()} onElegir={vi.fn()}
                juego={{ estrellas: new Map(), puntos: new Map(), diasPuntos: new Map(), racha: 3, totalPuntos: 1633, rango: rangoPorPuntos(1633) }} />,
        );
        const hoy = screen.getByRole('button', { name: /jueves, 26 de noviembre/i });
        expect(hoy.querySelector('[class*="insignia"]')).toBeNull();
        expect(hoy.className).toMatch(/nivelCurso/);
        const martes = screen.getByRole('button', { name: /martes, 24 de noviembre/i });
        expect(martes.querySelector('[class*="insignia_bajo"]')).not.toBeNull();
        expect(screen.getByRole('progressbar', { name: 'Avance hacia el siguiente rango' })).toBeInTheDocument();
    });
});
