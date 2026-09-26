/**
 * [P1-PLAN-LOTE-361 · 2026-09-26] «Otra…» se aplica como una opción más, sin volver a analizar la foto.
 *
 * El dueño: escribió «4 huevos» en «Otra…», tocó «Arepa» en la otra duda y la foto se volvió a analizar entera (el
 * blur del campo la disparaba): el análisis nuevo borró la «Arepa» y los 4 huevos no se veían en ningún lado. Ahora
 * lo escrito pide su AJUSTE por texto (`/api/diary/scan/ajuste-duda`) y entra como una opción elegida y confirmada
 * («✓ 4 huevos»); mientras calcula, SOLO esa duda dice «Calculando…» y las demás siguen tocables.
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import DudasDeLaFoto from '../components/common/DudasDeLaFoto';
import { platoDesdeAnalisis, conRespuesta, conRespuestaEscrita, macrosDelPlato } from '../components/dashboard/scanMealDishes';

const aj = (calories, protein = 0, carbs = 0, healthy_fats = 0) => ({ calories, protein, carbs, healthy_fats });
const ANALISIS = {
    meal_name: 'Omelet con panecillo y queso',
    macros: { calories: 700, protein: 44, carbs: 40, healthy_fats: 38 },
    items: [],
    dudas: [
        { pregunta: '¿De cuántos huevos hiciste la tortilla?', opciones: [
            { texto: '2 huevos', supuesta: false, ajuste: aj(-72, -6, 0, -5) },
            { texto: '3 huevos', supuesta: true, ajuste: aj(0) },
        ] },
        { pregunta: '¿Qué tipo de base tiene el queso derretido?', opciones: [
            { texto: 'Panecillo', supuesta: true, ajuste: aj(0) },
            { texto: 'Arepa de maíz', supuesta: false, ajuste: aj(60, 1, 12, 1) },
        ] },
    ],
};

describe('[361] la respuesta escrita es una opción más', () => {
    it('entra elegida y confirmada, suma su ajuste y NO toca la otra duda', () => {
        let p = conRespuesta(platoDesdeAnalisis(ANALISIS), 1, 1);                 // «Arepa» primero
        p = conRespuestaEscrita(p, 0, '4 huevos', aj(72, 6, 0, 5));
        expect(p.dudas[0].opciones.map((o) => o.texto)).toEqual(['2 huevos', '3 huevos', '4 huevos']);
        expect(p.respuestas).toEqual({ 0: 2, 1: 1 });
        expect(p.confirmadas).toEqual({ 0: true, 1: true });
        expect(macrosDelPlato(p).calories).toBe(832);                             // 700 + 72 + 60
    });

    it('escribir otra vez REEMPLAZA la escrita (no se acumulan)', () => {
        let p = conRespuestaEscrita(platoDesdeAnalisis(ANALISIS), 0, '4 huevos', aj(72));
        p = conRespuestaEscrita(p, 0, '5 huevos', aj(144));
        expect(p.dudas[0].opciones.map((o) => o.texto)).toEqual(['2 huevos', '3 huevos', '5 huevos']);
        expect(macrosDelPlato(p).calories).toBe(844);
    });

    it('si cambia qué es el plato, cambia el nombre', () => {
        const p = conRespuestaEscrita(platoDesdeAnalisis(ANALISIS), 1, 'casabe', aj(-20), 'Omelet con casabe y queso');
        expect(p.nombre).toBe('Omelet con casabe y queso');
    });
});

describe('[361] mientras calcula, solo esa duda espera', () => {
    it('«Calculando…» en la duda que se escribió; la otra sigue tocable', () => {
        const dudas = platoDesdeAnalisis(ANALISIS).dudas;
        render(<DudasDeLaFoto dudas={dudas} respuestas={{ 0: 1, 1: 0 }} confirmadas={{}} onElegir={() => {}}
            otraConCampo onOtra={() => {}} calculando={0} />);
        expect(screen.getByRole('status').textContent).toContain('Calculando…');
        expect(screen.getByRole('button', { name: '2 huevos' }).disabled).toBe(true);
        expect(screen.getByRole('button', { name: 'Arepa de maíz' }).disabled).toBe(false);
    });
});

describe('[361] cableado del escáner', () => {
    it('pide el ajuste por texto y ya no vuelve a analizar la foto', () => {
        const src = readFileSync(resolve(__dirname, '..', 'components', 'dashboard', 'ScanMealModal.jsx'), 'utf8');
        expect(src).toContain("fetchWithAuth('/api/diary/scan/ajuste-duda'");
        expect(src).toContain('conRespuestaEscrita(');
        expect(src).not.toContain('void analizar(p.id, x.file, texto)');
    });
});
