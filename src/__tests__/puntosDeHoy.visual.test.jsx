import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import PuntosDeHoy from '../components/dashboard/PuntosDeHoy';

const CSS = readFileSync(resolve(process.cwd(), 'src/components/dashboard/PuntosDeHoy.module.css'), 'utf8');

describe('PuntosDeHoy diseño visual y ausencia de solapamientos', () => {
    it('separa el premio (+11) de la pista parcial ("cerca +5") sin position: absolute sobre .logroMeta', () => {
        expect(CSS).not.toMatch(/\.logroTarjeta\s+\.logroMeta\s*\{[^}]*position:\s*absolute/);
        expect(CSS).toContain('.logroTop {');
        expect(CSS).toContain('.logroSub {');

        render(
            <PuntosDeHoy
                puntos={21}
                mult={1.6}
                racha={34}
                tramo={{ clave: 'leyenda', mult: 1.6 }}
                escudos={2}
                escudosMax={2}
                onAbrir={vi.fn()}
                hoy={{ mealsCount: 3, protein: 73, calories: 1550 }}
                targetProtein={120}
                logros={{
                    registro: true,
                    completo: true,
                    banda: false,
                    calorias_cerca: true,
                    proteina: false,
                    proteina_parcial: false,
                    agua: null,
                    dia_perfecto: false,
                }}
            />,
        );

        const lista = screen.getByRole('list', { name: 'Logros de hoy' });
        const bandaItem = within(lista).getByLabelText(/Calorías en meta: cerca:/);
        const ptsSpan = bandaItem.querySelector('[class*="logroTop"] [class*="logroPts"]');
        const subSpan = bandaItem.querySelector('[class*="logroSub"]');
        expect(ptsSpan?.textContent).toBe('+11');
        expect(subSpan?.textContent).toBe('cerca +5');
        expect(ptsSpan).not.toBe(subSpan);
    });

    it('cuando Racha a salvo hoy está cumplido usa tokens verdes (--ink-good) en borde y fondo', () => {
        const match = CSS.match(/\.logroRacha\.logroHecho\s*\{([^}]*)\}/);
        expect(match).toBeTruthy();
        expect(match[1]).toContain('var(--ink-good)');
        expect(match[1]).toContain('border-color:');
        expect(match[1]).toContain('background:');
    });

    it('cuando se pasa en grasas muestra 0 pts y "Sin bono ×1.6" en lugar de símbolos ambiguos', () => {
        render(
            <PuntosDeHoy
                puntos={25}
                mult={1.6}
                multActivo={false}
                racha={35}
                tramo={{ clave: 'leyenda', mult: 1.6 }}
                hoy={{ mealsCount: 4, protein: 85, fats: 75, calories: 1945 }}
                targetProtein={134}
                targetFats={57}
                logros={{
                    registro: true,
                    banda: true,
                    proteina: false,
                    grasas: false,
                    grasas_pasado: true,
                    dia_perfecto: false,
                }}
            />,
        );

        const lista = screen.getByRole('list', { name: 'Logros de hoy' });
        const rachaCard = screen.getByRole('img', { name: /35 días seguidos registrando/ });
        expect(within(rachaCard).getByText('Racha')).toBeInTheDocument();
        expect(within(rachaCard).getByText('35')).toBeInTheDocument();
        expect(within(rachaCard).queryByText('Leyenda')).not.toBeInTheDocument();
        const grasasItem = within(lista).getByLabelText(/Grasas altas: te pasaste de grasas hoy/);
        expect(grasasItem).toHaveTextContent('0 pts');
        expect(grasasItem).toHaveTextContent('Sin bono ×1.6');
        expect(grasasItem).not.toHaveTextContent('Sin × hoy');
    });
});
