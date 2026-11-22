/**
 * [P1-PLAN-LOTE-1161 · 2026-11-22] Las otras superficies del juego por puntos: los avisos de una vez (división, escudos,
 * récord, racha con multiplicador), el mapa de niveles con las estrellas/racha del servidor y compartir la semana.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../utils/progresoServidor', () => ({ marcarEventosVistos: vi.fn() }));

import CierreDeSemana from '../components/dashboard/CierreDeSemana';
import { armarMapa } from '../utils/mapaDeNiveles';
import { resumenDeSemana, textoDeSemana } from '../utils/compartirSemana';

describe('[1161] avisos del juego por puntos', () => {
    it('división, escudos, récord y racha con multiplicador', () => {
        render(<CierreDeSemana userId="u" eventos={[
            { clave: 'division:plata:2', codigo: 'division', datos: { clave: 'plata', division: 2 } },
            { clave: 'escudo:2026-11-20', codigo: 'escudo_ganado', datos: { escudos: 1 } },
            { clave: 'salvo:2026-11-21', codigo: 'escudo_salvo', datos: { racha: 9 } },
            { clave: 'record:2026-11-22', codigo: 'record_dia', datos: { puntos: 68 } },
            { clave: 'racha:7', codigo: 'racha', datos: { dias: 7, mult: 1.5 } },
            { clave: 'semana_cerrada:10', codigo: 'semana_cerrada', datos: { numero: 10, estrellas: 2, dias_en_meta: 1, puntos: 190, siguiente: 11 } },
        ]} />);
        expect(screen.getByText('¡Subiste a Plata II!')).toBeInTheDocument();
        expect(screen.getByText('Ganaste un escudo de racha')).toBeInTheDocument();
        expect(screen.getByText('Sigues con 9 días seguidos.')).toBeInTheDocument();
        expect(screen.getByText('68 pts hoy.')).toBeInTheDocument();
        expect(screen.getByText(/tus puntos valen ×1.5/)).toBeInTheDocument();
        expect(screen.getByText(/190 pts\. Empieza la Semana 11\./)).toBeInTheDocument();
    });
});

describe('[1161] mapa de niveles con el servidor', () => {
    it('estrellas por semana y racha del servidor; los mundos se abren por puntos', () => {
        const estadoDe = () => 'bajo';
        const servidor = { estrellas: new Map([[1, 2], [2, 1]]), puntos: new Map([[1, 400], [2, 250]]), racha: 9 };
        const m = armarMapa({ inicioISO: '2026-11-08', hoyISO: '2026-11-16', estadoDe, umbrales: [0, 600, 1800], servidor });
        expect(m.estrellas).toBe(3);
        expect(m.racha).toBe(9);
        expect(m.puntos).toBe(650);
        expect(m.mundo).toBe(1);                                    // 650 ≥ 600 ⇒ Plata
        expect(m.semanas.find((s) => s.numero === 2).abreMundo).toBe(1);
        // sin servidor, la regla vieja (días en meta): 0 estrellas
        expect(armarMapa({ inicioISO: '2026-11-08', hoyISO: '2026-11-16', estadoDe }).estrellas).toBe(0);
    });
});

describe('[1161] compartir la semana con puntos', () => {
    it('el rango lleva división y el texto los puntos', () => {
        const r = resumenDeSemana({ numero: 10, dias: [], estrellas: 2, racha: 9, rango: 'plata', division: 2, puntos: 190 });
        expect(r.rango.nombre).toBe('Plata II');
        expect(textoDeSemana(r)).toContain('⚡ 190 pts esta semana');
    });
});
