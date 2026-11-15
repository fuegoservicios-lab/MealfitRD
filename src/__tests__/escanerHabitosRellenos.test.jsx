/**
 * [ESCANER-HABITOS-Y-RELLENOS · 2026-11-14]
 * Verifica que:
 * 1. Platos compuestos soportan hasta 3 dudas.
 * 2. Al tocar "Omitir preguntas" tras elegir una opción (ej. "4 huevos enteros") o escribir un borrador
 *    en "Otra…", NO se pierden las selecciones ya hechas ni se sobreescriben con "3 huevos enteros".
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import RespuestasDeLaFoto from '../components/agent/RespuestasDeLaFoto';
import { dudasDeLasFotos, etiquetasFotosDesde, indicesFotosDeDudas, normalizarDudas } from '../utils/dudasDeLaFoto';
import { respuestasPorFoto } from '../utils/fotoAntesDelCoach';

const DUDAS_3 = [
    {
        pregunta: '¿Qué llevan los sándwiches por dentro?',
        opciones: [
            { texto: 'Solo jamón', supuesta: true, ajuste: { calories: 0, protein: 0, carbs: 0, healthy_fats: 0 } },
            { texto: 'Cottage y mantequilla de maní', ajuste: { calories: 310, protein: 17, carbs: 8, healthy_fats: 23 } },
        ],
    },
    {
        pregunta: '¿Cuántos huevos hervidos eran?',
        opciones: [
            { texto: '3 huevos enteros', supuesta: true, ajuste: { calories: 0, protein: 0, carbs: 0, healthy_fats: 0 } },
            { texto: '4 huevos enteros', ajuste: { calories: 72, protein: 6, carbs: 0, healthy_fats: 5 } },
        ],
    },
    {
        pregunta: '¿De qué es la masa de los pancakes?',
        opciones: [
            { texto: 'Harina normal', supuesta: true, ajuste: { calories: 0, protein: 0, carbs: 0, healthy_fats: 0 } },
            { texto: 'Avena y guineo', ajuste: { calories: -30, protein: 2, carbs: -6, healthy_fats: 0 } },
        ],
    },
];

describe('ESCANER-HABITOS-Y-RELLENOS', () => {
    it('acepta hasta 3 dudas en platos compuestos sin truncar la tercera', () => {
        expect(normalizarDudas(DUDAS_3)).toHaveLength(3);
        expect(dudasDeLasFotos([{ dudas: DUDAS_3 }])).toHaveLength(3);
    });

    it('al tocar "Omitir preguntas" conserva la opción que el usuario ya tocó (ej. 4 huevos enteros)', () => {
        const onOmitir = vi.fn();
        render(
            <RespuestasDeLaFoto
                dudas={DUDAS_3.slice(1)}
                onEnviar={vi.fn()}
                onOmitir={onOmitir}
                enPanel
            />
        );
        // El usuario selecciona "4 huevos enteros" y luego toca "Omitir preguntas" para saltarse la duda restante
        fireEvent.click(screen.getByRole('button', { name: '4 huevos enteros' }));
        fireEvent.click(screen.getByRole('button', { name: 'Omitir preguntas' }));
        expect(onOmitir).toHaveBeenCalledTimes(1);
        expect(onOmitir).toHaveBeenCalledWith(
            '4 huevos enteros · Harina normal',
            { calories: 72, protein: 6, carbs: 0, healthy_fats: 5 },
        );
    });

    it('al tocar "Omitir preguntas" con texto escrito en "Otra…" lo preserva en lugar de enviarlo vacío', () => {
        const onOmitir = vi.fn();
        render(
            <RespuestasDeLaFoto
                dudas={DUDAS_3.slice(0, 2)}
                onEnviar={vi.fn()}
                onOmitir={onOmitir}
                enPanel
            />
        );
        fireEvent.click(screen.getAllByRole('button', { name: 'Otra…' })[0]);
        fireEvent.change(screen.getByLabelText('Tu respuesta: ¿Qué llevan los sándwiches por dentro?'), {
            target: { value: 'queso cottage y mantequilla de mani' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Omitir preguntas' }));
        expect(onOmitir).toHaveBeenCalledTimes(1);
        expect(onOmitir).toHaveBeenCalledWith(
            'queso cottage y mantequilla de mani · 3 huevos enteros',
            null,
        );
    });

    it('soporta 4 fotos y hasta 6 dudas por plato complejo sin recortar ni mezclar ajustes', () => {
        const subidas = [
            { dudas: DUDAS_3.slice(0, 2) }, // foto 0: 2 dudas
            { dudas: DUDAS_3.slice(2, 3) }, // foto 1: 1 duda
            { dudas: [] },                  // foto 2: 0 dudas
            { dudas: [                      // foto 3: 2 dudas
                {
                    pregunta: '¿Qué carne es?',
                    opciones: [
                        { texto: 'Pollo', supuesta: true, ajuste: { calories: 0, protein: 0, carbs: 0, healthy_fats: 0 } },
                        { texto: 'Salmón', ajuste: { calories: 90, protein: 2, carbs: 0, healthy_fats: 9 } },
                    ],
                },
                {
                    pregunta: '¿Con qué grasa se cocinó?',
                    opciones: [
                        { texto: 'A la plancha', supuesta: true, ajuste: { calories: 0, protein: 0, carbs: 0, healthy_fats: 0 } },
                        { texto: 'Aceite', ajuste: { calories: 80, protein: 0, carbs: 0, healthy_fats: 9 } },
                    ],
                },
            ] },
        ];
        const todas = dudasDeLasFotos(subidas);
        const indices = indicesFotosDeDudas(subidas);
        expect(todas).toHaveLength(5);
        expect(indices).toEqual([0, 0, 1, 3, 3]);

        // 5 dudas en un solo plato compuesto también pasan completas (hasta 6)
        expect(normalizarDudas([...DUDAS_3, ...subidas[3].dudas])).toHaveLength(5);

        const porFoto = respuestasPorFoto(
            todas,
            { 0: 1, 1: 1, 3: 1, 4: 1 },
            { 2: 'harina de almendras' }, // foto 1 lleva escrita → su ajuste es null; fotos 0 y 3 conservan suma exacta
            indices,
        );
        expect(porFoto).toEqual([
            {
                index: 0,
                respuestas: 'Cottage y mantequilla de maní · 4 huevos enteros',
                ajuste: { calories: 382, protein: 23, carbs: 8, healthy_fats: 28 },
            },
            {
                index: 1,
                respuestas: 'harina de almendras',
                ajuste: null,
            },
            {
                index: 3,
                respuestas: 'Salmón · Aceite',
                ajuste: { calories: 170, protein: 2, carbs: 0, healthy_fats: 18 },
            },
        ]);

        const subidasConNombres = [
            { meal_name: 'Bowl de frutas', dudas: DUDAS_3.slice(0, 2) },
            { meal_name: 'Arroz con cerdo', dudas: DUDAS_3.slice(2, 3) },
            { meal_name: 'Sándwiches de jamón', dudas: [] },
            { meal_name: 'Salmón', dudas: subidas[3].dudas },
        ];
        const etiquetas = etiquetasFotosDesde(indices, subidasConNombres);
        expect(etiquetas).toEqual([
            'Foto 1 · Bowl de frutas',
            'Foto 1 · Bowl de frutas',
            'Foto 2 · Arroz con cerdo',
            'Foto 4 · Salmón',
            'Foto 4 · Salmón',
        ]);
        // Una sola foto con dudas NO muestra etiquetas extra
        expect(etiquetasFotosDesde([0, 0], subidasConNombres)).toBeNull();

        render(
            <RespuestasDeLaFoto
                dudas={todas}
                etiquetas={etiquetas}
                onEnviar={vi.fn()}
                onOmitir={vi.fn()}
                enPanel
            />
        );
        expect(screen.getByText(/Foto 1 · Bowl de frutas/)).toBeTruthy();
        expect(screen.getByText(/Foto 2 · Arroz con cerdo/)).toBeTruthy();
        expect(screen.getByText(/Foto 4 · Salmón/)).toBeTruthy();
    });
});
