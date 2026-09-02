// [P1-ADAPTIVE-RENEWAL · 2026-07-11] Check-in de renovación: preguntas CAMBIANTES
// (peso actual + señales del ciclo) antes de generar el nuevo ciclo. Alimenta
// weight_history → el motor "metabolismo evolutivo" del backend calibra las
// calorías del próximo plan con el progreso REAL (≥2 registros, ≥14 días).
// Nunca bloquea: "Omitir" y cualquier error de red continúan a la generación.
import { useState } from 'react';
import { toast } from 'sonner';
import { fetchWithAuth } from '../../config/api';
import { useT, formatPercent } from '../../i18n';

const SCALE = [1, 2, 3, 4, 5];

// [P1-CHECKIN-COHERENCE · 2026-07-26] `defaultUnit` viene del perfil. Antes la unidad estaba
// HARDCODEADA a 'lb' (label y payload) mientras el valor se pre-rellenaba con el peso del perfil
// sin mirar `weightUnit`. Hay perfiles con `weight=75` y `weightUnit=None` — 75 lb no es un adulto
// plausible, casi seguro son kg: a esa persona se le pre-rellenaba 75 etiquetado en libras y se
// guardaba como libras, con 2x de error en su metabolismo.
const RenewalCheckinModal = ({ defaultWeight = '', defaultUnit = 'lb', onDone }) => {
    const t = useT();
    const unit = String(defaultUnit || 'lb').toLowerCase() === 'kg' ? 'kg' : 'lb';
    const [weight, setWeight] = useState(defaultWeight ? String(defaultWeight) : '');
    const [hunger, setHunger] = useState(null);
    const [energy, setEnergy] = useState(null);
    const [adherence, setAdherence] = useState(80);
    const [sending, setSending] = useState(false);

    const submit = async () => {
        const w = parseFloat(String(weight).replace(',', '.'));
        // Rango por unidad: 900 kg / 2000 lb es el techo duro del backend, pero un valor
        // fuera de lo plausible casi siempre es un dedazo (o la unidad equivocada).
        const max = unit === 'kg' ? 900 : 2000;
        if (!Number.isFinite(w) || w <= 0 || w > max) {
            toast.info(t('Ingresa un peso válido en {unidad} (o pulsa Omitir).', { unidad: unit }));
            return;
        }
        setSending(true);
        let _saved = null;
        try {
            const res = await fetchWithAuth('/api/plans/renewal-checkin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    weight: w,
                    unit,
                    hunger,
                    energy,
                    adherence_pct: adherence,
                }),
            });
            if (res.ok) {
                // [P1-CHECKIN-QUEUE-PARITY · 2026-09-02] El peso guardado vuelve al caller para que
                // el formulario local (lo que se ENVÍA al generar) use el mismo valor que el perfil.
                // Antes el modal guardaba 135 y el plan salía con el peso viejo del wizard.
                _saved = { weight: w, unit };
                const body = await res.json();
                if (body && body.engine_active) {
                    toast.success(t('Progreso registrado'), {
                        description: t('Tu plan se calculará con {peso} {unidad} y tu progreso real calibrará las calorías.', { peso: w, unidad: unit }),
                        duration: 5000,
                    });
                } else {
                    toast.success(t('Peso registrado'), {
                        description: t('Tu plan se calculará con {peso} {unidad}. Con 2 registros separados 14+ días, el sistema empezará a calibrar las calorías por tu progreso.', { peso: w, unidad: unit }),
                        duration: 5500,
                    });
                }
            } else {
                // [P1-CHECKIN-COHERENCE · 2026-07-26] Antes esto era un `if (res.ok)` SIN else: un
                // 403 o un 500 no mostraba nada y el usuario seguía creyendo que su peso se había
                // guardado. Desde fuera, "omití" y "falló" eran indistinguibles — y de hecho un
                // weight_history vacío no permitía saber cuál de las dos había pasado.
                toast.warning(t('No se pudo guardar tu peso'), {
                    description: t('El plan se genera igual, con los datos que ya tenías.'),
                    duration: 5000,
                });
                console.error('renewal-checkin HTTP', res.status);
            }
        } catch (e) {
            // Best-effort: el check-in jamás bloquea la generación, pero SÍ se avisa.
            console.error('renewal-checkin failed:', e);
            toast.warning(t('No se pudo guardar tu peso'), {
                description: t('El plan se genera igual, con los datos que ya tenías.'),
                duration: 5000,
            });
        }
        onDone(_saved);
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
                <h2 style={{ margin: 0, fontSize: 20 }}>{t('Un minuto antes de tu nuevo plan')}</h2>
                {/* [P1-CHECKIN-COHERENCE · 2026-07-26] El copy anterior afirmaba "no es la fórmula
                    genérica — es TU metabolismo medido". Con 0 o 1 registro eso es FALSO: el motor
                    evolutivo necesita 2 registros separados 14+ días y hasta entonces las calorías
                    salen de la fórmula estándar. Ahora dice lo que sí es cierto hoy: tu peso entra
                    en el cálculo, y la calibración por progreso llega cuando haya con qué medirla. */}
                <p style={{ margin: '8px 0 18px', fontSize: 13, color: '#9aa6bc', lineHeight: 1.5 }}>
                    {t('Tu peso de hoy fija las calorías de este plan. Con dos pesos separados al menos dos semanas, también ajustaremos las calorías según tu progreso real. Lo demás es opcional.')}
                </p>

                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    {t('Peso actual ({unidad})', { unidad: unit })}
                </label>
                <input
                    type="number"
                    inputMode="decimal"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    placeholder={unit === 'kg' ? t('Ej. 56') : t('Ej. 123')}
                    style={{
                        width: '100%', padding: '12px 14px', borderRadius: 12, fontSize: 16,
                        background: '#141c2e', border: '1px solid #2c3a52', color: '#e8edf6',
                        marginBottom: 18, boxSizing: 'border-box',
                    }}
                />

                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    {t('¿Cuánta hambre pasaste este ciclo?')} <span style={{ fontWeight: 400, color: '#8b95a8' }}>{t('(opcional)')}</span>
                </label>
                <div style={{ marginBottom: 16 }}>{scaleRow(hunger, setHunger, t('Nada'), t('Mucha'))}</div>

                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    {t('¿Cómo estuvo tu energía?')} <span style={{ fontWeight: 400, color: '#8b95a8' }}>{t('(opcional)')}</span>
                </label>
                <div style={{ marginBottom: 16 }}>{scaleRow(energy, setEnergy, t('Baja'), t('Alta'))}</div>

                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    {t('¿Cuánto del plan seguiste?')} <span style={{ color: '#34d399' }}>{formatPercent(adherence)}</span>
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
                    {sending ? t('Guardando…') : t('Guardar y generar mi plan')}
                </button>
                <button
                    type="button"
                    onClick={() => onDone(null)}
                    disabled={sending}
                    style={{
                        width: '100%', padding: '11px 0', marginTop: 10, borderRadius: 12,
                        border: '1px solid #2c3a52', background: 'transparent',
                        color: '#8b95a8', fontSize: 13, cursor: 'pointer',
                    }}
                >
                    {t('Generar sin guardar')}
                </button>
            </div>
        </div>
    );
};

export default RenewalCheckinModal;
