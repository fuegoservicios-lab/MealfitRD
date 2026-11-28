/**
 * [P1-PLAN-LOTE-1162 · 2026-11-22] El mapa de niveles con el juego por puntos (el dueño: «hazlo más entendible»):
 * el marcador dice el rango con división, la tarjeta de cada semana habla de PUNTOS y su barra se llena hacia los
 * 260 con las estrellas donde se ganan (ya no la barra de días en meta, que contradecía «Semana perfecta»).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import MapaDeNiveles from '../components/dashboard/MapaDeNiveles';

const HOY = '2026-11-22';                       // domingo: día 1 de la Semana 3 de este camino
const juego = {
    estrellas: new Map([[1, 1], [2, 3], [3, 0]]),
    puntos: new Map([[1, 400], [2, 650], [3, 0]]),
    racha: 15,
    escudosUsados: new Set(['2026-11-21']),
};
const pintar = (props = {}) => render(
    <MapaDeNiveles inicioISO="2026-11-08" hoyISO={HOY} selected={HOY} estadoDe={(iso) => (iso === '2026-11-21' ? null : 'bajo')} porFecha={new Map()} onElegir={vi.fn()} juego={juego} {...props} />,
);

describe('[1162] mapa por puntos', () => {
    it('el marcador dice el rango con división y la racha del servidor', () => {
        pintar({
            juego: {
                ...juego,
                diasPuntos: new Map([[HOY, 45]]),
                diasPerfectos: new Set([HOY]),
            },
        });
        expect(screen.getByText('Plata III')).toBeInTheDocument();         // 1.050 pts ⇒ [1163] Plata III (810-1080)
        expect(screen.getByText(/1[.,]050 pts/)).toBeInTheDocument();       // barra de progreso de rango en HUD
        expect(screen.getByText('+45')).toBeInTheDocument();               // puntos del día en el nodo del mapa
        expect(screen.getByRole('button', { name: /Mejor semana/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Racha/ }).textContent).toContain('15');
        expect(screen.getByRole('button', { name: /Escudo protegió tu racha/ })).toBeInTheDocument();
    });

    it('las tarjetas de semana hablan de puntos (no de días en meta)', () => {
        pintar();
        expect(screen.getByText('650 pts · Semana perfecta')).toBeInTheDocument();
        expect(screen.getByText('400 pts')).toBeInTheDocument();
        expect(screen.getByText('0 pts · faltan 60 para tu primera estrella')).toBeInTheDocument();
        expect(screen.queryByText(/días? en meta/)).toBeNull();
    });

    it('sin juego (servidor viejo) sigue la regla de días en meta', () => {
        pintar({ juego: null });
        expect(screen.getAllByText(/días? en meta/).length).toBeGreaterThan(0);
    });
});
