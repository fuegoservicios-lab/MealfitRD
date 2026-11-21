// [P1-PLAN-LOTE-1145 · 2026-11-21] Pedir y elegir el día que el usuario vive (`/api/diary/dia-activo`); la regla vive en
// `backend/dia_extendido.py` y se aplica en `diaBiologico.js`. Si el día cambia, `mealfit:diary-changed` rehace el contador.
import { fetchWithAuth } from '../config/api';
import { fijarDiaActivo } from './diaBiologico';

const _avisarCambio = () => {
    try {
        window.dispatchEvent(new CustomEvent('mealfit:diary-changed', { detail: { source: 'dia-activo' } }));
    } catch { /* sin ventana: nada que avisar */ }
};

export async function pedirDiaActivo() {
    try {
        const tz = new Date().getTimezoneOffset();
        const r = await fetchWithAuth(`/api/diary/dia-activo?tzOffset=${tz}`);
        if (!r.ok) return null;
        const estado = await r.json();
        if (fijarDiaActivo(estado)) _avisarCambio();
        return estado;
    } catch {
        return null;
    }
}

export async function elegirDiaActivo(accion) {
    const r = await fetchWithAuth('/api/diary/dia-activo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion }),
    });
    if (!r.ok) throw new Error(`POST /api/diary/dia-activo → HTTP ${r.status}`);
    const estado = await r.json();
    fijarDiaActivo(estado);
    _avisarCambio();
    return estado;
}

