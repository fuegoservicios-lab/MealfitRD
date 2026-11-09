import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { generateIntelligentWelcome } from '../pages/AgentPage';
import { MemoizedMessageBubble } from '../components/agent/MessageBubble';
import { franjaDeLaHora } from '../utils/saludoDelCoach';

afterEach(cleanup);

describe('Pulido del Saludo y Bienvenida del Coach (BB-044)', () => {
    it('franjaDeLaHora corta a las 4 AM en punto (día biológico)', () => {
        expect(franjaDeLaHora(0)).toBe('madrugada');
        expect(franjaDeLaHora(3)).toBe('madrugada');
        expect(franjaDeLaHora(4)).toBe('desayuno');
        expect(franjaDeLaHora(10)).toBe('desayuno');
    });

    it('generateIntelligentWelcome extrae el primer nombre desde userProfile.full_name', () => {
        const perfil = { id: 'u1', full_name: 'Moisés Emilio Sánchez', plan_mode: 'tracking' };
        const bienvenida = generateIntelligentWelcome(perfil, {}, null, null);
        expect(bienvenida).toContain('Moisés');
    });

    it('MemoizedMessageBubble NO renderiza fuentes de salud ni barra de acciones (👍/👎/📋) si isWelcome es true', () => {
        const welcomeMsg = {
            role: 'model',
            content: '¡Buenos días, Moisés! Día nuevo: todavía no hay nada anotado. ¿Qué vas a desayunar? Te da buena proteína.',
            isWelcome: true,
        };

        const { container } = render(
            <MemoryRouter initialEntries={['/dashboard/agent']}>
                <MemoizedMessageBubble
                    msg={welcomeMsg}
                    index={0}
                    currentSessionId="sess-1"
                />
            </MemoryRouter>
        );

        // No debe aparecer "Fuentes de salud" ni "MessageActions"
        expect(screen.queryByText(/Fuentes de salud/i)).not.toBeInTheDocument();
        expect(container.querySelector('.msg-actions')).toBeNull();
    });

    it('MemoizedMessageBubble SÍ renderiza fuentes de salud y acciones en respuestas reales del modelo', () => {
        const realMsg = {
            role: 'model',
            content: 'Anoté tu comida con 30g de proteína y 500 kcal.',
            isWelcome: false,
        };

        const { container } = render(
            <MemoryRouter initialEntries={['/dashboard/agent']}>
                <MemoizedMessageBubble
                    msg={realMsg}
                    index={1}
                    currentSessionId="sess-1"
                />
            </MemoryRouter>
        );

        expect(screen.getByText(/Fuentes de salud/i)).toBeInTheDocument();
        expect(container.querySelector('.msg-actions')).not.toBeNull();
    });
});
