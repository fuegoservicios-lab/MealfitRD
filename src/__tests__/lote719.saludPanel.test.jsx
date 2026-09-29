// [P1-PLAN-LOTE-719 · 2026-09-28] Configuración → «Alergias y dieta» (SaludPanel).
//
// Lo que protege:
//   · el editor parte de lo que tiene el SERVIDOR, no de la copia local (que puede ser vieja);
//   · cada botón guarda SOLO sus claves (un PATCH con el formulario entero es lo que borraba alergias);
//   · salir sin guardar devuelve el formulario local a lo guardado (un borrador abandonado no viaja en la
//     siguiente renovación) y avisa a Configuración de que hay cambios sin guardar.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from './utils/test-utils';
import SaludPanel from '../components/settings/SaludPanel';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

function montar({ servidor, local, updateUserProfile = vi.fn().mockResolvedValue({ success: true }) }) {
    const formData = { ...local };
    const updateData = vi.fn((k, v) => { formData[k] = v; });
    const onDirtyChange = vi.fn();
    const utils = render(<SaludPanel onDirtyChange={onDirtyChange} />, {
        customContext: {
            formData,
            updateData,
            userProfile: { id: 'u-719', health_profile: servidor },
            updateUserProfile,
        },
    });
    return { ...utils, formData, updateData, onDirtyChange, updateUserProfile };
}

describe('[P1-PLAN-LOTE-719] SaludPanel', () => {
    it('al abrir, el formulario adopta las alergias del servidor aunque la copia local sea distinta', () => {
        const { updateData } = montar({
            servidor: { allergies: ['Mariscos', 'Lacteos'], dietType: 'balanced' },
            local: { allergies: ['Mariscos'], dietType: 'balanced' },
        });
        expect(updateData).toHaveBeenCalledWith('allergies', ['Mariscos', 'Lacteos']);
        expect(updateData).not.toHaveBeenCalledWith('dietType', expect.anything());
    });

    it('«Guardar alergias» manda SOLO las claves de alergias', async () => {
        const { updateUserProfile } = montar({
            servidor: { allergies: ['Mariscos'], otherAllergies: '', dietType: 'balanced', medicalConditions: ['Ninguna'] },
            local: { allergies: ['Mariscos'], otherAllergies: '', dietType: 'balanced', medicalConditions: ['Ninguna'] },
        });
        fireEvent.click(screen.getByRole('button', { name: /guardar alergias/i }));
        await waitFor(() => expect(updateUserProfile).toHaveBeenCalledTimes(1));
        const { health_profile } = updateUserProfile.mock.calls[0][0];
        expect(Object.keys(health_profile).sort()).toEqual(['allergies', 'otherAllergies']);
        expect(health_profile.allergies).toEqual(['Mariscos']);
    });

    it('salir sin guardar devuelve el formulario a lo guardado', () => {
        const { updateData, formData, unmount } = montar({
            servidor: { allergies: ['Mariscos'] },
            local: { allergies: ['Mariscos'] },
        });
        formData.allergies = ['Mariscos', 'Gluten'];   // un borrador que el usuario no guardó
        unmount();
        expect(updateData).toHaveBeenLastCalledWith('allergies', ['Mariscos']);
    });
});
