/**
 * [P1-PLAN-LOTE-718 · 2026-09-28] Súper Personalización: nombres accesibles y formData al día al cargar.
 *
 *   · Los `<label>` no apuntaban a nada: los campos de etiquetas, los selects y el texto libre no tenían nombre
 *     accesible, y los tres selects del perfil de sabor se anunciaban igual («—»).
 *   · La copia de `formData.super_personalization` solo se refrescaba al GUARDAR: editado en otro dispositivo, la
 *     renovación del plan de aquí devolvía la versión vieja al servidor.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from './utils/test-utils';
import SuperPersonalizationPanel from '../components/settings/SuperPersonalizationPanel';
import { fetchWithAuth } from '../config/api';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn(), api: (p) => p }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const PAYLOAD = {
    foodLikes: ['plátano'],
    cuisines: [],
    kitchenEquipment: ['Horno'],
    religiousRestriction: '',
    cookingSkill: 'intermedio',
    flavorProfile: { picante: 'bajo' },
    freeText: 'Trabajo de noche.',
};
const respuesta = (body) => ({ ok: true, status: 200, json: async () => body });

beforeEach(() => {
    vi.clearAllMocks();
    fetchWithAuth.mockImplementation(async () => respuesta({ super_personalization: PAYLOAD }));
});

describe('[718] cada control tiene nombre', () => {
    it('etiquetas, selects, sabores y texto libre se encuentran por su etiqueta visible', async () => {
        render(<SuperPersonalizationPanel />, { customContext: { updateData: vi.fn() } });
        const gustos = await screen.findByLabelText('Lo que te encanta comer');
        expect(gustos.tagName).toBe('INPUT');
        // Con etiquetas puestas el campo ya no se queda mudo: tiene su etiqueta y una pista de qué hacer.
        expect(gustos).toHaveAttribute('placeholder', 'Añade otro…');
        expect(screen.getByLabelText('Cocinas o estilos que prefieres').tagName).toBe('INPUT');
        expect(screen.getByLabelText('Restricción cultural / religiosa').tagName).toBe('SELECT');
        expect(screen.getByLabelText('Nivel de cocina').tagName).toBe('SELECT');
        expect(screen.getByLabelText('Picante').tagName).toBe('SELECT');
        expect(screen.getByLabelText('Dulce').tagName).toBe('SELECT');
        expect(screen.getByLabelText('Salado').tagName).toBe('SELECT');
        expect(screen.getByLabelText('Cuéntale lo que sea a la IA').tagName).toBe('TEXTAREA');
    });

    it('los grupos de chips son grupos con nombre y cada chip dice si está pulsado', async () => {
        render(<SuperPersonalizationPanel />, { customContext: { updateData: vi.fn() } });
        const equipo = await screen.findByRole('group', { name: 'Equipo de cocina que tienes' });
        expect(equipo).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Horno' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'Estufa' })).toHaveAttribute('aria-pressed', 'false');
        expect(screen.getByRole('group', { name: 'Perfil de sabor' })).toBeInTheDocument();
    });
});

describe('[718] formData al día al CARGAR', () => {
    it('si la copia de formData es vieja, se reemplaza por la del servidor', async () => {
        const updateData = vi.fn();
        render(<SuperPersonalizationPanel />, {
            customContext: { updateData, formData: { super_personalization: { foodLikes: ['viejo'] } } },
        });
        await waitFor(() => expect(updateData).toHaveBeenCalledWith('super_personalization', PAYLOAD));
    });

    it('si ya coincide, no se toca', async () => {
        const updateData = vi.fn();
        render(<SuperPersonalizationPanel />, { customContext: { updateData, formData: { super_personalization: PAYLOAD } } });
        await screen.findByLabelText('Lo que te encanta comer');
        expect(updateData).not.toHaveBeenCalled();
    });
});
