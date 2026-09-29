// [P1-PLAN-LOTE-766 · 2026-09-29] La tarjeta del suplemento en la Alacena, rediseñada (el dueño: «está feo»): una
// categoría más con su cuenta, nombre y marca, chips de estado y las porciones con − / + o, si no se saben, la pregunta
// con su campo. Solo lectura (sin handlers) las porciones van en un chip, como antes.
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, fireEvent } from '@testing-library/react';
import GrupoSuplementos from '../components/pantry/GrupoSuplementos';

const GAINER = { id: 91, nombre: 'Atlas Gainer', marca: 'Patriot Nutrition', porciones: 0, unidad: 'scoop', etiqueta: null, fuente: null };
const WHEY = {
    id: 7, nombre: 'Proteína Whey', marca: 'Optimum', porciones: 27, unidad: 'scoop', fuente: 'foto',
    etiqueta: { gramos_porcion: 31, kcal: 120, protein_g: 24, carbs_g: 3, fats_g: 1.5 },
};

describe('[766] la tarjeta del pote', () => {
    it('cabecera con su cuenta; nombre y marca por separado', () => {
        render(<GrupoSuplementos potes={[GAINER, WHEY]} soloDelPlan={[{ name: 'Creatina', dose: '5 g', timing: 'Mañana' }]} />);
        expect(screen.getByRole('heading', { name: /Suplementos/ })).toHaveTextContent('3');
        expect(screen.getByText('Atlas Gainer')).toBeInTheDocument();
        expect(screen.getByText('Patriot Nutrition')).toBeInTheDocument();
        expect(screen.queryByText('Atlas Gainer · Patriot Nutrition')).toBeNull();
    });

    it('sin etiqueta: chip ámbar y cómo completarla; con etiqueta: sus cifras y sin pista', () => {
        render(<GrupoSuplementos potes={[GAINER, WHEY]} soloDelPlan={[]} />);
        expect(screen.getByText('Sin etiqueta')).toBeInTheDocument();
        expect(screen.getAllByText('Mándale al coach una foto de la tabla nutricional para completar sus cifras.')).toHaveLength(1);
        expect(screen.getByText('1 scoop (31 g) · 120 kcal · 24 g proteína')).toBeInTheDocument();
    });

    it('porciones sabidas: − y + guardan al momento; lo tecleado se guarda con Guardar o Intro', () => {
        const cambiar = vi.fn();
        render(<GrupoSuplementos potes={[WHEY]} soloDelPlan={[]} onCambiarPorciones={cambiar} onBorrar={() => {}} />);
        expect(screen.getByText('Te quedan')).toBeInTheDocument();
        const campo = screen.getByLabelText('Porciones de Proteína Whey');
        expect(campo).toHaveValue(27);
        fireEvent.click(screen.getByRole('button', { name: 'Disminuir Proteína Whey' }));
        fireEvent.click(screen.getByRole('button', { name: 'Aumentar Proteína Whey' }));
        expect(cambiar.mock.calls).toEqual([[7, 26], [7, 28]]);
        // sin cambios no hay «Guardar» que confunda
        expect(screen.queryByRole('button', { name: 'Guardar porciones de Proteína Whey' })).toBeNull();
        fireEvent.change(campo, { target: { value: '30' } });
        fireEvent.keyDown(campo, { key: 'Enter' });
        expect(cambiar).toHaveBeenLastCalledWith(7, 30);
    });

    it('porciones sin saber: la pregunta con su campo, y «Guardar» solo con un número', () => {
        const cambiar = vi.fn();
        render(<GrupoSuplementos potes={[GAINER]} soloDelPlan={[]} onCambiarPorciones={cambiar} />);
        expect(screen.getByText('¿Cuántas porciones trae el pote?')).toBeInTheDocument();
        const guardar = screen.getByRole('button', { name: 'Guardar porciones de Atlas Gainer' });
        expect(guardar).toBeDisabled();
        fireEvent.change(screen.getByLabelText('Porciones de Atlas Gainer'), { target: { value: '56' } });
        expect(guardar).toBeEnabled();
        fireEvent.click(guardar);
        expect(cambiar).toHaveBeenCalledWith(91, 56);
        expect(screen.queryByText(/~0/)).toBeNull();
    });

    it('solo lectura: las porciones en un chip, sin controles', () => {
        render(<GrupoSuplementos potes={[WHEY, GAINER]} soloDelPlan={[]} />);
        expect(screen.getByText('~27 scoops')).toBeInTheDocument();
        expect(screen.getByText('Porciones por confirmar — díselas al coach')).toBeInTheDocument();
        expect(screen.queryByRole('button')).toBeNull();
        expect(screen.queryByRole('spinbutton')).toBeNull();
    });
});

describe('[766] la Alacena con suplementos no se declara vacía (móvil y escritorio)', () => {
    const src = readFileSync(resolve(__dirname, '..', 'pages', 'Pantry.jsx'), 'utf8');
    it('los dos vacíos se callan con suplementos, y queda la línea discreta', () => {
        expect(src).toContain("const alacenaSoloSuplementos = tempZone === 'seco' && !searchQuery.trim()");
        expect((src.match(/depletedForTemp\.length === 0 && !alacenaSoloSuplementos && \(/g) || []).length).toBe(2);
        expect(src).toContain('className={mstyles.soloSuplementos}');
        expect(src).toContain('className={fstyles.soloSuplementos}');
    });
});
