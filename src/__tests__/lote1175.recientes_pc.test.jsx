// [P1-PLAN-LOTE-1175 · 2026-11-27] La columna de chats del coach en PC: grupos por fecha y filas de una línea.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SidebarRecientes } from '../components/agent/SidebarRecientes';

const grupos = [
    { id: 'hoy', label: 'Hoy', items: [{ id: 'a', title_key: 'coach', last_activity: new Date().toISOString() }] },
    { id: 'ayer', label: 'Ayer', items: [{ id: 'b', title: 'Almuerzo de chuleta con arroz', last_activity: new Date(Date.now() - 864e5).toISOString() }] },
    { id: '30dias', label: 'Últimos 30 días', items: [{ id: 'c', title: 'Galleta de koko', last_activity: '2026-11-12T15:00:00Z' }] },
];

const pintar = (isMobile) => render(
    <SidebarRecientes showSidebar setShowSidebar={vi.fn()} handleNewChat={vi.fn()} isLoadingSessions={false}
        chatSessions={grupos.flatMap((g) => g.items)} groupedSessions={grupos} currentSessionId="a"
        setCurrentSessionId={vi.fn()} handleDeleteChat={vi.fn()} isLoading={false} isMobile={isMobile} />,
);

describe('lote 1175 · recientes en PC', () => {
    it('PC: rótulos de grupo y fecha solo en los grupos viejos, a la derecha', () => {
        const { container } = pintar(false);
        expect(screen.getByText('Ayer')).toBeTruthy();
        expect(screen.getByText('Últimos 30 días')).toBeTruthy();
        const fechas = container.querySelectorAll('.chat-fecha');
        expect(fechas.length).toBe(1);                       // solo «Galleta de koko»
        expect(screen.getByText('Aviso del coach')).toBeTruthy();
    });

    it('móvil: la fecha sigue en cada fila, en su segunda línea (sin cambios)', () => {
        const { container } = pintar(true);
        expect(container.querySelectorAll('.chat-fecha').length).toBe(0);
        expect(container.querySelectorAll('.chat-session-btn').length).toBe(3);
    });
});
