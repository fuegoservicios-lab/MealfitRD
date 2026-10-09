import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import HealthSources from '../components/common/HealthSources';
import { HEALTH_SOURCES, healthSourcesFor } from '../data/healthSources';

afterEach(cleanup);

describe('referencias visibles de salud', () => {
    it('relaciona el consejo con su tema y evita atribuir proteína deportiva a enfermedad renal', () => {
        const refs = healthSourcesFor('chat', 'Tengo enfermedad renal, ¿cuánta proteína puedo comer?');
        expect(refs.map(s => s.id)).toEqual(expect.arrayContaining(['protein', 'kidney']));
        expect(refs.find(s => s.id === 'protein').title).toContain('adultos sanos');
        expect(refs.find(s => s.id === 'kidney').url).toContain('niddk.nih.gov');
    });
    it('no añade referencias a saludos o acciones ajenas a salud', () => {
        expect(healthSourcesFor('chat', 'Hola, ¿cómo estás?')).toEqual([]);
        expect(healthSourcesFor('chat', 'Ya borré tu entrada.')).toEqual([]);
    });
    it('incluye energía, catálogo, DRI y OMS junto al plan y al contador', () => {
        for (const context of ['plan', 'tracking']) {
            expect(healthSourcesFor(context).map(s => s.id)).toEqual(context === 'tracking'
                ? ['amdr', 'energy', 'foods', 'dri', 'diet'] : ['energy', 'foods', 'dri', 'diet']);
        }
    });
    it('muestra fuentes oficiales enlazadas, alcance y acceso interno a todas las referencias', () => {
        render(<MemoryRouter initialEntries={['/dashboard/agent']}><HealthSources context="chat" text="Tu sodio y tu glucosa" /></MemoryRouter>);
        expect(screen.getByText('Fuentes de salud')).toBeInTheDocument();
        expect(screen.getByLabelText('Fuentes de salud y nutrición')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /límites de sodio/ })).toHaveAttribute('href', expect.stringContaining('who.int'));
        expect(screen.getByRole('link', { name: /con diabetes/ })).toHaveAttribute('href', expect.stringContaining('niddk.nih.gov'));
        expect(screen.getByRole('link', { name: /Ver todas/ })).toHaveAttribute('href', '/medical#fuentes');
        expect(screen.getByText(/no constituyen un diagnóstico/)).toBeInTheDocument();
    });
    it('permite leer todas las referencias sin abrir otro acordeón en el aviso médico', () => {
        const { container } = render(<MemoryRouter><HealthSources context="all" expanded /></MemoryRouter>);
        expect(container.querySelector('details')).toHaveAttribute('open');
        expect(screen.getAllByRole('link')).toHaveLength(HEALTH_SOURCES.length);
        for (const source of HEALTH_SOURCES) expect(new URL(source.url).protocol).toBe('https:');
    });
});
