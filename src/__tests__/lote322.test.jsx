/**
 * [P1-PLAN-LOTE-322 · 2026-09-25] Las dudas de la foto se responden con UN TOQUE.
 *
 * El dueño (captura del escáner: «¿De cuántos huevos…?» / «¿Panecillo, arepa o galleta?»): «una forma más fácil de
 * responder». Cada duda trae opciones con lo que cambian las macros del plato (la supuesta en 0): tocar una mueve
 * las calorías al instante, sin otra llamada a la IA. En el chat, las mismas opciones son respuestas rápidas.
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { platoDesdeAnalisis, macrosDelPlato, conRespuesta, conPorcion } from '../components/dashboard/scanMealDishes';
import DudasDeLaFoto from '../components/common/DudasDeLaFoto';
import { dudasDeLasFotos, mensajeDeRespuestas } from '../utils/dudasDeLaFoto';

const aj = (calories, protein = 0, carbs = 0, healthy_fats = 0) => ({ calories, protein, carbs, healthy_fats });
const ANALISIS = {
    meal_name: 'Tortilla u omelette doblado',
    macros: { calories: 510, protein: 26, carbs: 30, healthy_fats: 30 },
    items: [],
    dudas: [
        { sobre: 'huevo', pregunta: '¿De cuántos huevos hiciste la tortilla?', opciones: [
            { texto: '2 huevos', supuesta: false, ajuste: aj(-72, -6, 0, -5) },
            { texto: '3 huevos', supuesta: true, ajuste: aj(0) },
            { texto: '4 huevos', supuesta: false, ajuste: aj(72, 6, 0, 5) },
        ] },
        { sobre: 'base', pregunta: '¿La base con queso es panecillo, arepa o galleta?', opciones: [
            { texto: 'Panecillo', supuesta: true, ajuste: aj(0) },
            { texto: 'Arepa', supuesta: false, ajuste: aj(60, 1, 12, 1), nombre_plato: 'Arepas con queso y tortilla' },
        ] },
    ],
};

describe('[322] el escáner aplica la opción al instante', () => {
    it('el plato trae las opciones y la supuesta ya marcada', () => {
        const p = platoDesdeAnalisis(ANALISIS);
        expect(p.dudas[0].opciones.map((o) => o.texto)).toEqual(['2 huevos', '3 huevos', '4 huevos']);
        expect(p.respuestas).toEqual({ 0: 1, 1: 0 });
        expect(macrosDelPlato(p).calories).toBe(510);
    });

    it('tocar «4 huevos» suma su ajuste; «Arepa» además cambia el nombre', () => {
        let p = platoDesdeAnalisis(ANALISIS);
        p = conRespuesta(p, 0, 2);
        expect(macrosDelPlato(p)).toMatchObject({ calories: 582, protein: 32, healthy_fats: 35 });
        p = conRespuesta(p, 1, 1);
        expect(macrosDelPlato(p).calories).toBe(642);
        expect(p.nombre).toBe('Arepas con queso y tortilla');
        expect(p.confirmadas).toEqual({ 0: true, 1: true });
    });

    it('el ajuste escala con la porción (2× la tortilla de 4 huevos)', () => {
        const p = conPorcion(conRespuesta(platoDesdeAnalisis(ANALISIS), 0, 2), 2);
        expect(macrosDelPlato(p).calories).toBe(1164);
    });

    it('opciones basura se descartan y una sola opción no es una elección', () => {
        const p = platoDesdeAnalisis({ macros: {}, dudas: [{ pregunta: '¿Cuántos?', opciones: [{ texto: '3', supuesta: true }, 'x', { texto: '' }] }] });
        expect(p.dudas[0].opciones).toEqual([]);
        expect(p.respuestas).toEqual({});
    });
});

describe('[322] los botones de la duda', () => {
    const dudas = platoDesdeAnalisis(ANALISIS).dudas;

    it('pinta cada opción como botón, con la elegida presionada, y avisa con (duda, opción)', () => {
        const toques = [];
        render(<DudasDeLaFoto dudas={dudas} respuestas={{ 0: 1, 1: 0 }} confirmadas={{}} onElegir={(d, o) => toques.push([d, o])} />);
        expect(screen.getByRole('button', { name: '3 huevos' }).getAttribute('aria-pressed')).toBe('true');
        fireEvent.click(screen.getByRole('button', { name: '4 huevos' }));
        expect(toques).toEqual([[0, 2]]);
    });

    it('una duda confirmada se encoge a una línea y se puede cambiar', () => {
        const toques = [];
        render(<DudasDeLaFoto dudas={dudas} respuestas={{ 0: 2, 1: 0 }} confirmadas={{ 0: true }} onElegir={(d, o) => toques.push([d, o])} />);
        expect(screen.queryByRole('button', { name: '2 huevos' })).toBeNull();
        expect(screen.getByText('4 huevos')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Cambiar: 4 huevos' }));
        expect(screen.getByRole('button', { name: '2 huevos' })).toBeTruthy();
    });

    it('el escáner usa estos botones', async () => {
        const { readFileSync } = await import('node:fs');
        const { resolve } = await import('node:path');
        const src = readFileSync(resolve(__dirname, '..', 'components', 'dashboard', 'ScanMealModal.jsx'), 'utf8');
        expect(src).toContain('<DudasDeLaFoto');
        expect(src).toContain('conRespuesta(');
    });
});

describe('[322] en el chat, las mismas opciones son respuestas rápidas', () => {
    const subidas = [{ dudas: ANALISIS.dudas }, { dudas: [] }];

    it('junta las dudas CON opciones de las fotos del turno (máx. 2)', () => {
        const d = dudasDeLasFotos(subidas);
        expect(d.map((x) => x.pregunta)).toHaveLength(2);
        expect(dudasDeLasFotos([{ dudas: [{ pregunta: '¿Cuántos?', opciones: [] }] }])).toEqual([]);
    });

    it('el mensaje que se envía junta las respuestas en una sola línea (un solo turno del coach)', () => {
        const d = dudasDeLasFotos(subidas);
        expect(mensajeDeRespuestas(d, { 0: 2, 1: 1 })).toBe('4 huevos · Arepa');
    });

    it('AgentPage guarda las dudas de la subida y las ofrece bajo la respuesta del coach', async () => {
        const { readFileSync } = await import('node:fs');
        const { resolve } = await import('node:path');
        const ap = readFileSync(resolve(__dirname, '..', 'pages', 'AgentPage.jsx'), 'utf8');
        expect(ap).toContain('dudas: Array.isArray(data.dudas) ? data.dudas : []');
        expect(ap).toContain('setDudasDeLaFoto(dudasDeLasFotos(uploadedAttachments))');
        expect(ap).toContain('<RespuestasDeLaFoto');
    });
});

