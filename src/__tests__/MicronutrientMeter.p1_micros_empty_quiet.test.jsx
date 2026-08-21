/**
 * [P1-MICROS-EMPTY-QUIET · 2026-08-21] «Cuando el plan está pausado y no hay
 * ningún plato, los micronutrientes deberían verse mejor — aparecen todos en 0%
 * y se siente como mucho contexto innecesario».
 *
 * El reporte de micros es el PROMEDIO de lo que aportan los platos del plan.
 * Sin platos (día pausado antes de materializar, plan recién pausado), TODO el
 * panel sale en 0: 15 tarjetas «por mejorar» con barra al 0%, sugerencias de
 * suplementos y precauciones clínicas — un muro de contexto sobre comidas que
 * NO existen. La señal es DATA-driven (todos los valores en 0), no el estado de
 * la cola: un reporte todo-ceros es vacuo sea cual sea la causa, y cualquier
 * plato real aporta algo a alguno de los 17 micros.
 *
 * El estado compacto conserva la identidad del panel (cabecera + una línea que
 * dice cuándo se llenará) en vez de desaparecerlo: un panel que se esfuma deja
 * al usuario preguntándose dónde quedó.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from './utils/test-utils';
import MicronutrientMeter from '../components/dashboard/MicronutrientMeter';

const floor = (nutriente, valor, piso) => ({ nutriente, key: nutriente.toLowerCase(), valor, unidad: 'g', piso, status: valor >= piso ? 'ok' : 'bajo' });
const ceil = (nutriente, valor, techo) => ({ nutriente, key: nutriente.toLowerCase(), valor, unidad: 'mg', techo, status: valor > techo ? 'alto' : 'ok' });

describe('[P1-MICROS-EMPTY-QUIET] reporte todo-ceros → panel compacto, no muro de 0%', () => {
    it('con todo en 0 muestra la nota compacta y NINGUNA tarjeta de mejora ni estadística', () => {
        render(
            <MicronutrientMeter
                report={{ panel: [floor('Fibra', 0, 38), floor('Vitamina D', 0, 15), ceil('Sodio', 0, 2000)] }}
                advice={{ items: [{ nutriente: 'Fibra', key: 'fibra', dosis_sugerida: '5-10 g/día' }] }}
            />,
        );
        expect(screen.getByText(/Aún no hay platos que medir/)).toBeInTheDocument();
        // Nada del muro: ni sección caliente, ni porcentajes, ni dosis de suplemento.
        expect(screen.queryByText('Por mejorar hoy')).not.toBeInTheDocument();
        expect(screen.queryByText('0%')).not.toBeInTheDocument();
        expect(screen.queryByText(/5-10 g/)).not.toBeInTheDocument();
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('con CUALQUIER valor real, el panel completo queda intacto', () => {
        render(
            <MicronutrientMeter
                report={{ panel: [floor('Fibra', 12, 38), floor('Vitamina D', 0, 15), ceil('Sodio', 900, 2000)] }}
                advice={{ items: [] }}
            />,
        );
        expect(screen.getByText('Por mejorar hoy')).toBeInTheDocument();
        expect(screen.queryByText(/Aún no hay platos que medir/)).not.toBeInTheDocument();
        expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0);
    });
});
