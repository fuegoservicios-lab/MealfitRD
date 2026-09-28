// [P1-PLAN-LOTE-627 · 2026-09-27] Los suplementos de la Alacena en el idioma del usuario.
//
// La auditoría de idiomas: el grupo «Suplementos» (lote 290) pintaba tal cual lo que escribe el plan —«Proteína Whey»,
// «1 scoop (≈30 g), la porción de tu etiqueta», «Después de entrenar o en la merienda»— con la app en inglés o
// francés. Ahora pasa por la misma traducción de textos libres que ya usan los recuerdos del coach
// (`useTextosTraducidos`, `POST /api/i18n/textos`); sin traducción, el texto tal cual. El nombre del pote que escribió
// el usuario no se toca.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

const pedidos = [];
vi.mock('../hooks/useTextosTraducidos', () => ({
    useTextosTraducidos: (textos) => {
        pedidos.push(...textos.filter(Boolean));
        return (x) => (typeof x === 'string' && x ? `EN ${x}` : x);
    },
}));

import GrupoSuplementos from '../components/pantry/GrupoSuplementos';

describe('[627] los suplementos de la Alacena en el idioma del usuario', () => {
    it('lo que escribe el plan (nombre, dosis y momento) sale traducido; el pote del usuario no', () => {
        render(
            <GrupoSuplementos
                potes={[{ id: 'p1', nombre: 'Mi whey', porciones: 20, unidad: 'scoop', etiqueta: null,
                          delPlan: { dose: '1 scoop (≈30 g)', timing: 'Después de entrenar' } }]}
                soloDelPlan={[{ name: 'Creatina Monohidrato', dose: '3-5 g al día', timing: 'Con una comida' }]}
            />,
        );
        expect(screen.getByText('Mi whey')).toBeInTheDocument();
        expect(screen.getByText(/EN Creatina Monohidrato/)).toBeInTheDocument();
        expect(screen.getByText(/EN 3-5 g al día/)).toBeInTheDocument();
        expect(screen.getByText(/EN Con una comida/)).toBeInTheDocument();
        expect(screen.getByText(/EN 1 scoop \(≈30 g\)/)).toBeInTheDocument();
        expect(screen.getByText(/EN Después de entrenar/)).toBeInTheDocument();
        expect(pedidos).not.toContain('Mi whey');
    });

    it('sin nada que mostrar sigue sin pintar nada', () => {
        const { container } = render(<GrupoSuplementos potes={[]} soloDelPlan={[]} />);
        expect(container).toBeEmptyDOMElement();
    });
});
