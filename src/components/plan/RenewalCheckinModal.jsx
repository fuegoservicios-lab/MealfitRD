// [P1-ADAPTIVE-RENEWAL · 2026-07-11] Check-in de renovación: preguntas CAMBIANTES
// (peso actual + señales del ciclo) antes de generar el nuevo ciclo. Alimenta
// weight_history → el motor "metabolismo evolutivo" del backend calibra las
// calorías del próximo plan con el progreso REAL (≥2 registros, ≥14 días).
// Nunca bloquea: "Omitir" y cualquier error de red continúan a la generación.
import { useState } from 'react';
import { toast } from 'sonner';
import { fetchWithAuth } from '../../config/api';

const SCALE = [1, 2, 3, 4, 5];

const RenewalCheckinModal = ({ defaultWeight = '', onDone }) => {
    const [weight, setWeight] = useState(defaultWeight ? String(defaultWeight) : '');
    const [hunger, setHunger] = useState(null);
    const [energy, setEnergy] = useState(null);
    const [adherence, setAdherence] = useState(80);
    const [sending, setSending] = useState(false);

    const submit = async () => {
        const w = parseFloat(String(weight).replace(',', '.'));
        if (!Number.isFinite(w) || w <= 0 || w > 2000) {
            toast.info('Ingresa un peso válido (o pulsa Omitir).');
            return;
        }
        setSending(true);
        try {
            const res = await fetchWithAuth('/api/plans/renewal-checkin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    weight: w,
                    unit: 'lb',
                    hunger,
                    energy,
                    adherence_pct: adherence,
                }),
            });
            if (res.ok) {
                const body = await res.json();
                if (body && body.engine_active) {
                    toast.success('Progreso registrado', {
                        description: 'Tu progreso real calibrará las calorías de este ciclo.',
                        duration: 4500,
                    });
                } else {
                    toast.success('Peso registrado', {
                        description: 'Con registros de 2+ semanas, el sistema calibra tus calorías automáticamente.',
                        duration: 4500,
                    });
                }
            }
        } catch (e) {
            // Best-effort: el check-in jamás bloquea la generación.
            console.error('renewal-checkin failed:', e);
        }
        onDone();
    };

    const scaleRow = (value, setValue, lowLabel, highLabel) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#8b95a8', width: 52 }}>{lowLabel}</span>
            {SCALE.map((n) => (
                <button
                    key={n}
                    type="button"
                    onClick={() => setValue(n)}
                    style={{
                        width: 36, height: 36, borderRadius: 10, cursor: 'pointer',
                        border: value === n ? '2px solid #34d399' : '1px solid #2c3a52',
                        background: value === n ? 'rgba(52,211,153,0.15)' : '#141c2e',
                        color: value === n ? '#34d399' : '#c7d0e0', fontWeight: 700,
                    }}
                >
                    {n}
                </button>
            ))}
            <span style={{ fontSize: 11, color: '#8b95a8', width: 52, textAlign: 'right' }}>{highLabel}</span>
        </div>
    );

    return (
        <div style={{
            minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(160deg, #0b1120 0%, #111a2e 100%)', padding: 16,
        }}>
            <div style={{
                width: '100%', maxWidth: 430, background: '#0f1729', borderRadius: 18,
                border: '1px solid #223050', padding: '26px 24px', color: '#e8edf6',
                boxShadow: '0 18px 60px rgba(0,0,0,0.45)',
            }}>
                <h2 style={{ margin: 0, fontSize: 20 }}>Antes de tu nuevo ciclo</h2>
                <p style={{ margin: '8px 0 18px', fontSize: 13, color: '#9aa6bc', lineHeight: 1.5 }}>
                    30 segundos: con tu progreso real, el sistema calibra las calorías del
                    próximo plan (no es la fórmula genérica — es TU metabolismo medido).
                </p>

                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    Peso actual (lb)
                </label>
                <input
                    type="number"
                    inputMode="decimal"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    placeholder="Ej. 123"
                    style={{
                        width: '100%', padding: '12px 14px', borderRadius: 12, fontSize: 16,
                        background: '#141c2e', border: '1px solid #2c3a52', color: '#e8edf6',
                        marginBottom: 18, boxSizing: 'border-box',
                    }}
                />

                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    ¿Cuánta hambre pasaste este ciclo?
                </label>
                <div style={{ marginBottom: 16 }}>{scaleRow(hunger, setHunger, 'Nada', 'Mucha')}</div>

                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    ¿Cómo estuvo tu energía?
                </label>
                <div style={{ marginBottom: 16 }}>{scaleRow(energy, setEnergy, 'Baja', 'Alta')}</div>

                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    ¿Cuánto del plan seguiste? <span style={{ color: '#34d399' }}>{adherence}%</span>
                </label>
                <input
                    type="range" min="0" max="100" step="10" value={adherence}
                    onChange={(e) => setAdherence(parseInt(e.target.value, 10))}
                    style={{ width: '100%', marginBottom: 22, accentColor: '#34d399' }}
                />

                <button
                    type="button"
                    onClick={submit}
                    disabled={sending}
                    style={{
                        width: '100%', padding: '13px 0', borderRadius: 12, border: 'none',
                        background: sending ? '#1d4c3c' : '#10b981', color: '#06281d',
                        fontSize: 15, fontWeight: 800, cursor: sending ? 'wait' : 'pointer',
                    }}
                >
                    {sending ? 'Guardando…' : 'Continuar con mi plan'}
                </button>
                <button
                    type="button"
                    onClick={onDone}
                    disabled={sending}
                    style={{
                        width: '100%', padding: '11px 0', marginTop: 10, borderRadius: 12,
                        border: '1px solid #2c3a52', background: 'transparent',
                        color: '#8b95a8', fontSize: 13, cursor: 'pointer',
                    }}
                >
                    Omitir esta vez
                </button>
            </div>
        </div>
    );
};

export default RenewalCheckinModal;
