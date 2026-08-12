// [P1-UNIT-TOGGLE · P1-GOAL-TARGET-NARROW · P1-PLANSOURCE-DEAD-CONTROL · 2026-08-10]
// Grupo 5 de la auditoría de listo-para-tienda: los pasos con controles hechos a mano.
//
// Lo que se cierra, y por qué NO es cosmético:
//
//   UNIT-TOGGLE — CM/FT, LB/KG y RD$/US$ estaban escritos tres veces. Los dos de
//     medidas median 22px de alto con CERO separación entre objetivos (contenedor flex
//     sin `gap`, botones sin borde): la frontera entre «CM» y «FT» era invisible al
//     dedo. Y detrás hay aritmética: altura y peso alimentan el TDEE. `LB` viene
//     preseleccionado, así que quien usa kilos tiene que acertarle a 22px pegados a su
//     vecino; si falla se queda en libras sin enterarse y 70 kg entran como 70 lb.
//     Peor: fallar hacia el vecino DISPARA el cambio de unidad, que borra el peso ya
//     escrito. En presupuesto, el mismo error convierte RD$5.000 en US$5.000.
//
//   GOAL-TARGET — a 320px la rejilla `1fr auto` daba 71,4px al campo contra 196,6px al
//     chip; descontando el cromo quedaban 29px de texto y «200» no cabía. No era un
//     desborde de página: se cortaba DENTRO del campo, sin barra ni señal. A 430px el
//     campo mide 181px, y por eso nunca se vio en un teléfono grande.
//
//   PLANSOURCE — sin cuenta, la segunda tarjeta del PRIMER paso no hacía nada al
//     tocarla: ni deshabilitada, ni aviso, ni estilo. Y ese paso no tiene salida
//     alternativa. El revisor de la tienda entra como invitado.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from './utils/test-utils';
import userEvent from '@testing-library/user-event';
import { UnitToggle } from '../components/assessment/questions/_shared';
import { QPlanSource } from '../components/assessment/questions/QPlanSource';

// `vi.mock` se iza al tope del fichero, así que la fábrica no puede leer variables de
// módulo: hay que declarar los dobles DENTRO y recuperarlos después.
vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));
import { toast } from 'sonner';
const toastInfo = toast.info;

describe('[P1-UNIT-TOGGLE] el selector de unidad es un solo control compartido', () => {
    const opciones = [{ value: 'lb', label: 'LB' }, { value: 'kg', label: 'KG' }];

    it('los dos objetivos son alcanzables y NO están pegados', () => {
        render(<UnitToggle options={opciones} value="lb" onChange={vi.fn()} ariaLabel="Unidad de peso" />);
        const grupo = screen.getByRole('group', { name: 'Unidad de peso' });
        // El `gap` es lo que impide que ampliar el área táctil solo consiga que las dos
        // zonas sensibles se solapen y la frontera siga sin existir.
        expect(grupo).toHaveStyle({ gap: '4px' });
        for (const b of screen.getAllByRole('button')) {
            expect(b).toHaveStyle({ minHeight: '44px' });
        }
    });

    it('anuncia cuál está activo (aria-pressed), no solo lo pinta', () => {
        render(<UnitToggle options={opciones} value="kg" onChange={vi.fn()} ariaLabel="Unidad de peso" />);
        expect(screen.getByRole('button', { name: 'KG' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'LB' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('son type=button: dentro de un formulario, un botón sin tipo ENVÍA', () => {
        render(<UnitToggle options={opciones} value="lb" onChange={vi.fn()} ariaLabel="Unidad de peso" />);
        for (const b of screen.getAllByRole('button')) {
            expect(b).toHaveAttribute('type', 'button');
        }
    });

    it('elegir una unidad avisa al llamador con su valor', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<UnitToggle options={opciones} value="lb" onChange={onChange} ariaLabel="Unidad de peso" />);
        await user.click(screen.getByRole('button', { name: 'KG' }));
        expect(onChange).toHaveBeenCalledWith('kg');
    });
});

describe('[P1-PLANSOURCE-DEAD-CONTROL] el primer paso no tiene controles mudos', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    // [P1-GUEST-ONE-DEFINITION · 2026-08-12] La definición de invitado pasó a
    // ser LA DEL CONTEXTO (isGuest explícito), no Boolean(userProfile?.id):
    // un autenticado con el perfil aún en vuelo veía las tarjetas grises.
    // El harness modela el contrato nuevo.
    const montar = (isGuest) => {
        const updateData = vi.fn();
        render(<QPlanSource onAutoAdvance={vi.fn()} />, {
            customContext: { formData: {}, updateData, isGuest },
        });
        return updateData;
    };

    it('sin cuenta, la opción de Nevera se anuncia como no disponible', () => {
        montar(true);
        const tarjeta = screen.getByText('Que la IA use lo que ya tengo').closest('label');
        expect(tarjeta).toHaveAttribute('aria-disabled', 'true');
    });

    it('sin cuenta, tocarla EXPLICA en vez de no hacer nada', async () => {
        const user = userEvent.setup();
        const updateData = montar(true);
        await user.click(screen.getByText('Que la IA use lo que ya tengo'));
        expect(toastInfo).toHaveBeenCalledTimes(1);
        expect(toastInfo.mock.calls[0][0]).toMatch(/cuenta/i);
        // Y sigue sin seleccionarse: explicar no es permitir.
        expect(updateData).not.toHaveBeenCalled();
    });

    it('con cuenta, la opción funciona con normalidad', async () => {
        const user = userEvent.setup();
        const updateData = montar(false);
        const tarjeta = screen.getByText('Que la IA use lo que ya tengo').closest('label');
        expect(tarjeta).not.toHaveAttribute('aria-disabled');
        await user.click(screen.getByText('Que la IA use lo que ya tengo'));
        expect(toastInfo).not.toHaveBeenCalled();
        expect(updateData).toHaveBeenCalledWith('planSource', 'pantry');
    });

    it('la PRIMERA opción nunca se bloquea: es la salida del paso', () => {
        // Si ambas quedaran vetadas, el paso 1 sería un callejón sin fondo — no ofrece
        // botón de avanzar hasta tener un paso completado. Guest = peor caso.
        montar(true);
        const libre = screen.getByText('Que la IA elija los ingredientes').closest('label');
        expect(libre).not.toHaveAttribute('aria-disabled');
    });
});
