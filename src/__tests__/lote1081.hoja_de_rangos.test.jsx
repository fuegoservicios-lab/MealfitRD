/**
 * [P1-PLAN-LOTE-1081 · 2026-11-18] La hoja de rangos (el dueño: «se ve medio raro» y «quiero salir de manera más
 * cómoda, no solo con la X»): hoja propia que se cierra deslizando, tocando fuera, con Escape o con «Entendido»;
 * Bronce arriba; el camino sin «—» suelto; la barra vacía sin punto.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EscaleraDeRangos } from '../components/dashboard/EscaleraDeRangos';

const SRC = readFileSync(resolve(process.cwd(), 'src/components/dashboard/EscaleraDeRangos.jsx'), 'utf8');

describe('[1081] salir es cómodo', () => {
    it('«Entendido», tocar fuera y Escape cierran', () => {
        const onCerrar = vi.fn();
        render(<EscaleraDeRangos abierta onCerrar={onCerrar} estrellas={3} semanasCerradas={2} />);
        fireEvent.click(screen.getByRole('button', { name: 'Entendido' }));
        fireEvent.click(document.body.querySelector('[class*="fondo"]'));
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onCerrar).toHaveBeenCalledTimes(3);
    });

    it('se cierra deslizando: el gesto compartido de las hojas, no el arrastre del Modal', () => {
        expect(SRC).toContain('const hoja = useBottomSheet({ containerRef, bodyRef, onClose: onCerrar });');
        expect(SRC).toContain('onTouchStart={hoja.onTouchStart}');
        expect(SRC).not.toContain("from '../common/Modal'");
    });
});

describe('[1081] se lee mejor', () => {
    it('la escalera empieza en Bronce (tu punto de partida, visible sin desplazar)', () => {
        render(<EscaleraDeRangos abierta onCerrar={() => {}} estrellas={0} semanasCerradas={0} />);
        const nombres = [...document.querySelectorAll('ol li [class*="peldanoNombre"]')].map((n) => n.textContent);
        expect(nombres).toEqual(['Bronce', 'Plata', 'Oro', 'Platino', 'Diamante']);
    });

    it('sin ritmo no pinta «—»; con 0 estrellas la barra no lleva relleno', () => {
        render(<EscaleraDeRangos abierta onCerrar={() => {}} estrellas={0} semanasCerradas={0} />);
        expect(screen.queryByText('—')).toBeNull();
        expect(screen.getByText('Camino a Plata')).toBeTruthy();
        expect(screen.getByRole('progressbar').children).toHaveLength(0);
    });

    // [P1-PLAN-LOTE-1157] las «dos cuentas» son ahora «Cómo llegar» (tres ritmos) + tu ritmo si es razonable
    it('con ritmo dice cómo llegar y su ritmo', () => {
        render(<EscaleraDeRangos abierta onCerrar={() => {}} estrellas={6} semanasCerradas={4} />);
        expect(screen.getByText('Cómo llegar')).toBeTruthy();
        expect(screen.getByText('A tu ritmo de ahora: unas 3 semanas.')).toBeTruthy();
    });
});
