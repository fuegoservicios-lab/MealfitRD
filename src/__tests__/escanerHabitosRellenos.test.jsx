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
import { dudasDeLasFotos, normalizarDudas } from '../utils/dudasDeLaFoto';

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
});
