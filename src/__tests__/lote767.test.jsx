// [P1-PLAN-LOTE-767 · 2026-09-29] Sin la tabla del pote, el coach guarda las cifras del FRENTE del envase o las busca
// en INTERNET: la Alacena dice de dónde salen y cómo dejarlas exactas. Las de la tabla (foto) no llevan chip.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import GrupoSuplementos from '../components/pantry/GrupoSuplementos';

const ETIQUETA = { gramos_porcion: 31, kcal: 120, protein_g: 24, carbs_g: 3, fats_g: 1.5 };
const pote = (id, fuente) => ({ id, nombre: `Pote ${fuente}`, marca: null, porciones: 30, unidad: 'scoop', etiqueta: ETIQUETA, fuente });

describe('[767] de dónde salen las cifras', () => {
    it('internet, frente y estimado llevan su chip y su pista; la tabla de la foto, ninguno', () => {
        render(<GrupoSuplementos potes={[pote(1, 'web'), pote(2, 'frente'), pote(3, 'estimado'), pote(4, 'foto')]} soloDelPlan={[]} />);
        expect(screen.getByText('De internet')).toBeInTheDocument();
        expect(screen.getByText('Cifras encontradas en internet: si tu pote dice otra cosa, mándale al coach una foto de la tabla.')).toBeInTheDocument();
        expect(screen.getByText('Del frente del pote')).toBeInTheDocument();
        expect(screen.getByText('Carbohidratos y grasa estimados: con una foto de la tabla quedan exactos.')).toBeInTheDocument();
        expect(screen.getByText('Estimado')).toBeInTheDocument();
        expect(screen.getByText('Cifras típicas de este tipo de suplemento: con una foto de la tabla quedan exactas.')).toBeInTheDocument();
        // 4 potes con etiqueta y solo 3 con origen: la foto de la tabla no dice nada más
        expect(screen.getAllByText('1 scoop (31 g) · 120 kcal · 24 g proteína')).toHaveLength(4);
        expect(screen.queryByText('Sin etiqueta')).toBeNull();
    });
});
