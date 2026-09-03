// [P1-ADAPTIVE-RENEWAL · 2026-07-11] Check-in de renovación: preguntas CAMBIANTES
// (peso actual + señales del ciclo) antes de generar el nuevo ciclo. Alimenta
// weight_history → el motor "metabolismo evolutivo" del backend calibra las
// calorías del próximo plan con el progreso REAL (≥2 registros, ≥14 días).
// Nunca bloquea: cualquier error de red continúa a la generación.
//
// [P2-CHECKIN-NO-FABRICATED-ANSWERS · 2026-09-03] Solo se guarda lo que el usuario RESPONDE.
//   · La adherencia venía precargada al 80 % y viajaba siempre. No era un valor por defecto,
//     era una respuesta inventada — y el backend la usa como COMPUERTA: por debajo del piso no
//     ajusta las calorías por el cambio de peso («el peso no mide tu metabolismo si no seguiste
//     el plan»). Con el 80 % de fábrica, quien renovaba sin pensar pasaba la compuerta y el
//     sistema atribuía su peso a un plan que quizá no siguió. Ahora arranca «sin responder».
//   · Un solo botón («Generar mi plan»): guarda lo respondido; si no se tocó nada, no escribe
//     ningún check-in — que era exactamente lo que hacía «Generar sin guardar».
//   · El peso viene del perfil y NO se guarda hasta que el usuario lo edita o lo confirma con un
//     toque: registrar «135 lb hoy» porque estaba en pantalla también sería inventarlo.
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
    const initialWeight = defaultWeight ? String(defaultWeight) : '';
    const [weight, setWeight] = useState(initialWeight);
    const [weightConfirmed, setWeightConfirmed] = useState(false);
    const [hunger, setHunger] = useState(null);
    const [energy, setEnergy] = useState(null);
    const [adherence, setAdherence] = useState(null);
    const [sending, setSending] = useState(false);

    // El peso cuenta como respondido si se editó (distinto del perfil) o si se confirmó.
    const weightEdited = String(weight).trim() !== '' && String(weight).trim() !== initialWeight;
    const weightAnswered = weightEdited || weightConfirmed;
    const signalsAnswered = hunger !== null || energy !== null || adherence !== null;
    const anythingAnswered = weightAnswered || signalsAnswered;

    const submit = async () => {
        // Nada respondido ⇒ nada que guardar: a generar, sin escribir un check-in.
        if (!anythingAnswered) {
            onDone(null);
            return;
        }
        // Señales sin peso confirmado: el check-in es un registro de peso; confirmarlo es un toque.
        if (!weightAnswered) {
            toast.info(t('Confirma tu peso para guardar el check-in.'));
            return;
        }
        const w = parseFloat(String(weight).replace(',', '.'));
        // Rango por unidad: 900 kg / 2000 lb es el techo duro del backend, pero un valor
        // fuera de lo plausible casi siempre es un dedazo (o la unidad equivocada).
        const max = unit === 'kg' ? 900 : 2000;
        if (!Number.isFinite(w) || w <= 0 || w > max) {
            toast.info(t('Ingresa un peso válido en {unidad}.', { unidad: unit }));
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
                        duration: 5000,
                    });
                }
            } else {
                _saved = null;
                toast.warning(t('No se pudo guardar tu peso'), {
                    description: t('El plan se genera igual, con los datos que ya tenías.'),
                    duration: 4000,
                });
            }
        } catch {
            _saved = null;
            toast.warning(t('No se pudo guardar tu peso'), {
                description: t('El plan se genera igual, con los datos que ya tenías.'),
                duration: 4000,
            });
        }
        setSending(false);
        onDone(_saved);
    };

    const scaleRow = (value, setValue, lowLabel, highLabel) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: '#8b95a8', width: 44 }}>{lowLabel}</span>
            {SCALE.map((n) => (
                <button
                    key={n}
                    type="button"
                    className={`rc-scale ${value === n ? 'is-on' : ''}`}
                    onClick={() => setValue(value === n ? null : n)}
                    aria-pressed={value === n}
                    style={{ width: 36, height: 36, borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}
                >
                    {n}
                </button>
            ))}
            <span style={{ fontSize: 11, color: '#8b95a8', width: 44, textAlign: 'right' }}>{highLabel}</span>
        </div>
    );

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: 'rgba(4,8,20,0.78)', padding: 16,
        }}>
            {/* [P2-CHECKIN-HOVER-POLISH · 2026-09-03] Mismo lenguaje de hover que los CTAs del
                Dashboard (sombra del color del botón + anillo interior + brillo; P2-NO-CREDITS-CTA),
                estados hover/active/focus-visible en los botones de escala y el chip Confirmar,
                foco esmeralda en el campo de peso, entrada suave de la tarjeta y targets de 40 px en
                táctil. `prefers-reduced-motion` apaga animación y transiciones. */}
            <style>{`
                @keyframes rcIn { from { opacity: 0; transform: translateY(10px) scale(0.985); } to { opacity: 1; transform: none; } }
                .rc-card { animation: rcIn 0.28s cubic-bezier(0.4, 0, 0.2, 1); }
                .rc-input { transition: border-color 0.2s ease, box-shadow 0.2s ease; }
                .rc-input:hover { border-color: #3a4a66; }
                .rc-input:focus { outline: none; border-color: #34d399; box-shadow: 0 0 0 3px rgba(52,211,153,0.18); }
                .rc-scale, .rc-confirm {
                    border: 1px solid #2c3a52; background: transparent; color: #c7d0e0;
                    transition: border-color 0.18s ease, background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease, transform 0.12s ease;
                }
                .rc-scale:hover:not(:disabled), .rc-confirm:hover:not(:disabled) {
                    border-color: rgba(52,211,153,0.55); background: rgba(52,211,153,0.08); color: #e8fff5;
                    box-shadow: 0 6px 16px -8px rgba(52,211,153,0.35);
                }
                .rc-scale:active:not(:disabled), .rc-confirm:active:not(:disabled) { transform: scale(0.96); }
                .rc-scale.is-on, .rc-confirm.is-on {
                    border-color: #34d399; background: rgba(52,211,153,0.16); color: #34d399;
                    box-shadow: inset 0 0 0 1px rgba(52,211,153,0.35);
                }
                .rc-scale:focus-visible, .rc-confirm:focus-visible, .rc-cta:focus-visible { outline: 2px solid #34d399; outline-offset: 2px; }
                .rc-cta { transition: box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1), filter 0.25s ease, transform 0.12s ease; }
                .rc-cta:hover:not(:disabled) {
                    box-shadow: 0 14px 30px -8px rgba(16, 185, 129, 0.45), inset 0 0 0 1.5px rgba(255, 255, 255, 0.3);
                    filter: brightness(1.06);
                }
                .rc-cta:active:not(:disabled) {
                    box-shadow: 0 4px 12px -6px rgba(16, 185, 129, 0.3), inset 0 0 0 1.5px rgba(255, 255, 255, 0.3);
                    filter: brightness(0.96); transform: translateY(1px);
                }
                .rc-range { cursor: pointer; transition: filter 0.2s ease; }
                .rc-range:hover { filter: brightness(1.15); }
                @media (pointer: coarse) { .rc-scale { width: 40px !important; height: 40px !important; } }
                @media (prefers-reduced-motion: reduce) {
                    .rc-card { animation: none; }
                    .rc-input, .rc-scale, .rc-confirm, .rc-cta, .rc-range { transition: none; }
                }
            `}</style>
            <div className="rc-card" style={{
                width: '100%', maxWidth: 430, background: '#0f1626', border: '1px solid #232e45',
                borderRadius: 20, padding: '22px 22px 18px', color: '#e8edf6',
                boxShadow: '0 30px 80px rgba(0,0,0,0.55)',
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
                <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', marginBottom: 6 }}>
                    <input
                        className="rc-input"
                        type="number"
                        inputMode="decimal"
                        value={weight}
                        onChange={(e) => setWeight(e.target.value)}
                        placeholder={unit === 'kg' ? t('Ej. 56') : t('Ej. 123')}
                        style={{
                            flex: 1, minWidth: 0, padding: '12px 14px', borderRadius: 12, fontSize: 16,
                            background: '#141c2e', border: '1px solid #2c3a52', color: '#e8edf6',
                            boxSizing: 'border-box',
                        }}
                    />
                    {/* Confirmar con un toque: el peso del perfil no se guarda hasta que el usuario
                        lo edita o lo confirma. Con el peso editado el chip sobra. */}
                    {!weightEdited && initialWeight && (
                        <button
                            type="button"
                            className={`rc-confirm ${weightConfirmed ? 'is-on' : ''}`}
                            onClick={() => setWeightConfirmed((v) => !v)}
                            aria-pressed={weightConfirmed}
                            style={{
                                flex: 'none', padding: '0 14px', borderRadius: 12, fontSize: 13, fontWeight: 700,
                                cursor: 'pointer', whiteSpace: 'nowrap',
                            }}
                        >
                            {weightConfirmed ? t('Confirmado') : t('Confirmar')}
                        </button>
                    )}
                </div>
                <p style={{ margin: '0 0 16px', fontSize: 11.5, color: '#8b95a8', lineHeight: 1.4 }}>
                    {weightAnswered
                        ? t('Se guardará como tu peso de hoy.')
                        : t('Edítalo o confírmalo para que cuente como tu peso de hoy.')}
                </p>

                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    {t('¿Cuánta hambre pasaste este ciclo?')} <span style={{ fontWeight: 400, color: '#8b95a8' }}>{t('(opcional)')}</span>
                </label>
                <div style={{ marginBottom: 16 }}>{scaleRow(hunger, setHunger, t('Nada'), t('Mucha'))}</div>

                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    {t('¿Cómo estuvo tu energía?')} <span style={{ fontWeight: 400, color: '#8b95a8' }}>{t('(opcional)')}</span>
                </label>
                <div style={{ marginBottom: 16 }}>{scaleRow(energy, setEnergy, t('Baja'), t('Alta'))}</div>

                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    {t('¿Cuánto del plan seguiste?')}{' '}
                    <span style={{ fontWeight: 400, color: '#8b95a8' }}>{t('(opcional)')}</span>{' '}
                    <span style={{ color: adherence === null ? '#8b95a8' : '#34d399', fontWeight: adherence === null ? 400 : 600 }}>
                        {adherence === null ? t('Sin responder') : formatPercent(adherence)}
                    </span>
                </label>
                <input
                    className="rc-range"
                    type="range" min="0" max="100" step="10"
                    value={adherence === null ? 50 : adherence}
                    onChange={(e) => setAdherence(parseInt(e.target.value, 10))}
                    aria-label={t('¿Cuánto del plan seguiste?')}
                    aria-valuetext={adherence === null ? t('Sin responder') : formatPercent(adherence)}
                    style={{ width: '100%', marginBottom: 22, accentColor: adherence === null ? '#4b5870' : '#34d399' }}
                />

                <button
                    type="button"
                    className="rc-cta"
                    onClick={submit}
                    disabled={sending}
                    style={{
                        width: '100%', padding: '13px 0', borderRadius: 12, border: 'none',
                        background: sending ? '#1d4c3c' : '#10b981', color: '#06281d',
                        fontSize: 15, fontWeight: 800, cursor: sending ? 'wait' : 'pointer',
                    }}
                >
                    {sending ? t('Guardando…') : t('Generar mi plan')}
                </button>
                <p style={{ margin: '10px 0 0', fontSize: 12, color: '#8b95a8', textAlign: 'center', lineHeight: 1.4 }}>
                    {t('Solo guardamos lo que respondas.')}
                </p>
            </div>
        </div>
    );
};

export default RenewalCheckinModal;
