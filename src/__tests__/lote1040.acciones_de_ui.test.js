// [P1-PLAN-LOTE-1040 · A-27 · 2026-11-16] La pantalla se refresca por lo que el turno EJECUTÓ, no por la marca del modelo.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { aplicarAccionesDeUi, stripUiActionTags } from '../utils/chatStreamReconcile';

const manejadores = () => ({ onRefreshPlan: vi.fn(), onRefreshHydration: vi.fn(), onRefreshInventory: vi.fn() });

describe('[P1-PLAN-LOTE-1040] done.ui_actions', () => {
    it('registró una comida y el modelo NO escribió la marca: el diario se refresca igual', () => {
        const h = manejadores();
        const hechas = new Set();
        stripUiActionTags('¡Listo! Anoté tu cena: 690 kcal.', h);
        expect(h.onRefreshInventory).not.toHaveBeenCalled();
        expect(aplicarAccionesDeUi(['REFRESH_INVENTORY'], h, hechas)).toEqual(['REFRESH_INVENTORY']);
        expect(h.onRefreshInventory).toHaveBeenCalledTimes(1);
    });

    it('lo que el texto ya disparó no se repite', () => {
        const h = manejadores();
        const hechas = new Set(['REFRESH_PLAN']);
        expect(aplicarAccionesDeUi(['REFRESH_PLAN', 'REFRESH_HYDRATION'], h, hechas)).toEqual(['REFRESH_HYDRATION']);
        expect(h.onRefreshPlan).not.toHaveBeenCalled();
    });

    it('un paquete de servidor viejo (sin el campo) o una acción desconocida no hacen nada', () => {
        const h = manejadores();
        expect(aplicarAccionesDeUi(undefined, h)).toEqual([]);
        expect(aplicarAccionesDeUi(['BORRAR_TODO'], h)).toEqual([]);
        Object.values(h).forEach((f) => expect(f).not.toHaveBeenCalled());
    });

    it('AgentPage lo aplica en el done, después de las marcas del texto', () => {
        const src = readFileSync(resolve(__dirname, '../pages/AgentPage.jsx'), 'utf8');
        const i = src.indexOf('const _finalResponse = stripUiActionTags(dataObj.response, _accionesUi);');
        const j = src.indexOf('aplicarAccionesDeUi(dataObj.ui_actions, _accionesUi, _accionesHechas);');
        expect(i).toBeGreaterThan(0);
        expect(j).toBeGreaterThan(i);
    });
});
