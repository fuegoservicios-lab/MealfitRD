// [P1-CLINICAL-PANEL · 2026-07-03] Panel de "Perfil Clínico Avanzado" (opt-in).
// Las dimensiones clínicas que el wizard NO captura — P1 restantes del audit
// clínico 2026-07-03: laboratorios recientes, historia ponderal, síntomas
// digestivos y entrenamiento (tipo/hora/frecuencia) + texto libre. Persiste en
// health_profile.clinical_profile vía el endpoint backend (atómico, I6/I7 — NO
// escritura directa a DB). Al guardar, sincroniza formData.clinical_profile
// para que el plan/chat de la MISMA sesión ya lo usen.
//
// ADITIVO: NO reemplaza condiciones/alergias/medicamentos del wizard. Los labs
// generan GUÍA para la IA (flags honestos con "requiere confirmación
// profesional"), nunca diagnóstico — el copy del panel lo deja claro.
//
// Reutiliza el CSS module de SuperPersonalizationPanel a propósito: mismos
// tokens visuales (field/label/hint/chips/select/textarea/save) → los dos
// paneles opt-in de Ajustes se ven como una sola familia.
import { useState, useEffect, useCallback } from 'react';
import { Loader2, FlaskConical } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth } from '../../config/api';
import { useAssessment } from '../../context/AssessmentContext';
import styles from './SuperPersonalizationPanel.module.css';

const ENDPOINT = '/api/user/preferences/clinical-profile';
const MAX_FREETEXT = 1500;

const EMPTY = {
    labs: {},
    weightHistory: { unit: 'lb', maxWeight: '', minWeight: '', weight6mAgo: '', unintentionalLoss: false },
    giSymptoms: [],
    training: { type: '', timeOfDay: '', daysPerWeek: 0 },
    freeText: '',
};

// Mismos rangos anti-typo que `_CLINPROF_LAB_RANGES` (backend routers/user_data.py)
// — el backend es SSOT (422 si drift); estos min/max solo dan feedback inmediato.
const LAB_FIELDS = [
    { key: 'glucosa_ayunas', label: 'Glucosa en ayunas', unit: 'mg/dL', ph: 'Ej. 92', min: 40, max: 500 },
    { key: 'hba1c', label: 'HbA1c', unit: '%', ph: 'Ej. 5.4', min: 3, max: 15 },
    { key: 'colesterol_total', label: 'Colesterol total', unit: 'mg/dL', ph: 'Ej. 180', min: 80, max: 500 },
    { key: 'ldl', label: 'LDL', unit: 'mg/dL', ph: 'Ej. 100', min: 30, max: 400 },
    { key: 'hdl', label: 'HDL', unit: 'mg/dL', ph: 'Ej. 50', min: 10, max: 150 },
    { key: 'trigliceridos', label: 'Triglicéridos', unit: 'mg/dL', ph: 'Ej. 120', min: 30, max: 2000 },
    { key: 'creatinina', label: 'Creatinina', unit: 'mg/dL', ph: 'Ej. 0.9', min: 0.2, max: 15 },
    { key: 'tfg', label: 'TFG (filtrado renal)', unit: 'mL/min', ph: 'Ej. 95', min: 5, max: 150 },
    { key: 'tsh', label: 'TSH', unit: 'µUI/mL', ph: 'Ej. 2.1', min: 0.01, max: 100 },
    { key: 'acido_urico', label: 'Ácido úrico', unit: 'mg/dL', ph: 'Ej. 5.5', min: 1, max: 15 },
    { key: 'hemoglobina', label: 'Hemoglobina', unit: 'g/dL', ph: 'Ej. 14', min: 5, max: 22 },
    { key: 'vitamina_d', label: 'Vitamina D', unit: 'ng/mL', ph: 'Ej. 32', min: 4, max: 150 },
];

const GI_OPTIONS = [
    { val: 'reflujo', label: 'Reflujo / acidez' },
    { val: 'estrenimiento', label: 'Estreñimiento' },
    { val: 'diarrea', label: 'Diarrea frecuente' },
    { val: 'distension', label: 'Distensión / gases' },
    { val: 'ninguno', label: 'Ninguno' },
];

const TRAINING_TYPES = [
    { value: '', label: 'Sin especificar' },
    { value: 'fuerza', label: 'Fuerza / pesas' },
    { value: 'cardio', label: 'Cardio' },
    { value: 'mixto', label: 'Mixto (fuerza + cardio)' },
    { value: 'crossfit', label: 'CrossFit / funcional' },
    { value: 'calistenia', label: 'Calistenia' },
    { value: 'deporte', label: 'Deporte (baloncesto, béisbol…)' },
];

const TRAINING_TIMES = [
    { value: '', label: '—' },
    { value: 'manana', label: 'Mañana' },
    { value: 'mediodia', label: 'Mediodía' },
    { value: 'tarde', label: 'Tarde' },
    { value: 'noche', label: 'Noche' },
];

export default function ClinicalProfilePanel({ onSaved }) {
    const { updateData } = useAssessment();
    const [cp, setCp] = useState(EMPTY);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetchWithAuth(ENDPOINT);
            if (res.ok) {
                const data = await res.json();
                const p = data?.clinical_profile || {};
                setCp({
                    ...EMPTY,
                    labs: (p.labs && typeof p.labs === 'object') ? p.labs : {},
                    weightHistory: { ...EMPTY.weightHistory, ...((p.weightHistory && typeof p.weightHistory === 'object') ? p.weightHistory : {}) },
                    giSymptoms: Array.isArray(p.giSymptoms) ? p.giSymptoms : [],
                    training: { ...EMPTY.training, ...((p.training && typeof p.training === 'object') ? p.training : {}) },
                    freeText: typeof p.freeText === 'string' ? p.freeText : '',
                });
            }
        } catch {
            toast.error('No se pudo cargar tu perfil clínico.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const setLab = (k, v) => setCp((prev) => ({ ...prev, labs: { ...prev.labs, [k]: v.replace(',', '.') } }));
    const setWh = (k, v) => setCp((prev) => ({ ...prev, weightHistory: { ...prev.weightHistory, [k]: v } }));
    const setTr = (k, v) => setCp((prev) => ({ ...prev, training: { ...prev.training, [k]: v } }));
    // Sentinel 'ninguno' exclusivo — misma regla que los multi-select del wizard
    // (el backend la re-aplica igual; esto solo evita el estado contradictorio en UI).
    const toggleGi = (val) => setCp((prev) => {
        const cur = prev.giSymptoms;
        if (cur.includes(val)) return { ...prev, giSymptoms: cur.filter((x) => x !== val) };
        if (val === 'ninguno') return { ...prev, giSymptoms: ['ninguno'] };
        return { ...prev, giSymptoms: [...cur.filter((x) => x !== 'ninguno'), val] };
    });

    const save = async () => {
        setSaving(true);
        try {
            const body = {
                labs: cp.labs,
                weightHistory: cp.weightHistory,
                giSymptoms: cp.giSymptoms,
                training: cp.training,
                freeText: (cp.freeText || '').slice(0, MAX_FREETEXT),
            };
            const res = await fetchWithAuth(ENDPOINT, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (res.status === 422) {
                const err = await res.json().catch(() => null);
                toast.error(err?.detail || 'Revisa los valores: hay alguno fuera de rango.');
                return;
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const saved = data?.clinical_profile || body;
            // Sincroniza formData para que el plan/chat de ESTA sesión lo usen ya.
            try { updateData('clinical_profile', saved); } catch { /* no-op */ }
            if (onSaved) onSaved(saved);
            toast.success('Perfil clínico guardado. La IA lo usará en tus próximos planes.');
        } catch {
            toast.error('No se pudo guardar. Intenta de nuevo.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className={styles.loading}>
                <Loader2 className={styles.spin} size={22} /> Cargando…
            </div>
        );
    }

    return (
        <div className={styles.panel}>
            <div className={styles.intro}>
                <div className={styles.introIcon}><FlaskConical size={20} /></div>
                <p>
                    Datos de nivel consulta: laboratorios, historial de peso, digestión y
                    entrenamiento. Todo es <strong>opcional</strong> — mientras más completes,
                    más precisa la calibración. <strong>No sustituye diagnóstico médico</strong>:
                    si un valor sugiere algo, la IA lo usará con prudencia y te recomendará
                    confirmarlo con un profesional.
                </p>
            </div>

            {/* --- Laboratorios --- */}
            <div className={styles.field}>
                <label className={styles.label}>Laboratorios recientes</label>
                <p className={styles.hint}>
                    Copia los valores de tu último análisis (deja vacío lo que no tengas).
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '0.75rem' }}>
                    {LAB_FIELDS.map((f) => (
                        <div key={f.key}>
                            <label className={styles.hint} htmlFor={`lab-${f.key}`} style={{ display: 'block', marginBottom: '0.25rem' }}>
                                {f.label} ({f.unit})
                            </label>
                            <input
                                id={`lab-${f.key}`}
                                className={styles.select}
                                type="number" inputMode="decimal"
                                min={f.min} max={f.max} step="any"
                                placeholder={f.ph}
                                value={cp.labs[f.key] ?? ''}
                                onChange={(e) => setLab(f.key, e.target.value)}
                            />
                        </div>
                    ))}
                </div>
                <div style={{ marginTop: '0.75rem', maxWidth: 240 }}>
                    <label className={styles.hint} htmlFor="lab-date" style={{ display: 'block', marginBottom: '0.25rem' }}>
                        Fecha del análisis (aprox.)
                    </label>
                    <input
                        id="lab-date" className={styles.select} type="month"
                        value={cp.labs.labsDate ?? ''}
                        onChange={(e) => setCp((prev) => ({ ...prev, labs: { ...prev.labs, labsDate: e.target.value } }))}
                    />
                </div>
            </div>

            {/* --- Historia ponderal --- */}
            <div className={styles.field}>
                <label className={styles.label}>Historial de peso</label>
                <p className={styles.hint}>
                    Tu trayectoria de peso ayuda a calibrar el ritmo (dietas repetidas = metabolismo adaptado).
                </p>
                <div className={styles.chips} style={{ marginBottom: '0.6rem' }}>
                    {['lb', 'kg'].map((u) => (
                        <button
                            key={u} type="button"
                            className={`${styles.chip} ${cp.weightHistory.unit === u ? styles.chipActive : ''}`}
                            onClick={() => setWh('unit', u)}
                        >
                            {u.toUpperCase()}
                        </button>
                    ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '0.75rem' }}>
                    {[
                        { key: 'maxWeight', label: 'Peso máximo' },
                        { key: 'minWeight', label: 'Peso mínimo (adulto)' },
                        { key: 'weight6mAgo', label: 'Peso hace 6 meses' },
                    ].map((f) => (
                        <div key={f.key}>
                            <label className={styles.hint} htmlFor={`wh-${f.key}`} style={{ display: 'block', marginBottom: '0.25rem' }}>
                                {f.label} ({cp.weightHistory.unit})
                            </label>
                            <input
                                id={`wh-${f.key}`} className={styles.select}
                                type="number" inputMode="decimal" step="any" min="20" max="700"
                                value={cp.weightHistory[f.key] ?? ''}
                                onChange={(e) => setWh(f.key, e.target.value.replace(',', '.'))}
                            />
                        </div>
                    ))}
                </div>
                <div className={styles.chips} style={{ marginTop: '0.75rem' }}>
                    <button
                        type="button"
                        className={`${styles.chip} ${cp.weightHistory.unintentionalLoss ? styles.chipActive : ''}`}
                        onClick={() => setWh('unintentionalLoss', !cp.weightHistory.unintentionalLoss)}
                        aria-pressed={cp.weightHistory.unintentionalLoss}
                    >
                        He perdido peso sin proponérmelo últimamente
                    </button>
                </div>
            </div>

            {/* --- Síntomas digestivos --- */}
            <div className={styles.field}>
                <label className={styles.label}>Digestión</label>
                <p className={styles.hint}>Marca lo que te pasa con frecuencia — el menú se adapta.</p>
                <div className={styles.chips}>
                    {GI_OPTIONS.map((o) => (
                        <button
                            key={o.val} type="button"
                            className={`${styles.chip} ${cp.giSymptoms.includes(o.val) ? styles.chipActive : ''}`}
                            onClick={() => toggleGi(o.val)}
                            aria-pressed={cp.giSymptoms.includes(o.val)}
                        >
                            {o.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* --- Entrenamiento --- */}
            <div className={styles.field}>
                <label className={styles.label}>Entrenamiento</label>
                <p className={styles.hint}>
                    Con tipo y horario, la IA coloca los carbohidratos y la proteína alrededor de tu entreno.
                </p>
                <div className={styles.row}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                        <label className={styles.hint} htmlFor="tr-type" style={{ display: 'block', marginBottom: '0.25rem' }}>Tipo</label>
                        <select id="tr-type" className={styles.select} value={cp.training.type} onChange={(e) => setTr('type', e.target.value)}>
                            {TRAINING_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>
                    <div style={{ flex: 1, minWidth: 140 }}>
                        <label className={styles.hint} htmlFor="tr-time" style={{ display: 'block', marginBottom: '0.25rem' }}>Horario habitual</label>
                        <select id="tr-time" className={styles.select} value={cp.training.timeOfDay} onChange={(e) => setTr('timeOfDay', e.target.value)}>
                            {TRAINING_TIMES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>
                    <div style={{ flex: 1, minWidth: 140 }}>
                        <label className={styles.hint} htmlFor="tr-days" style={{ display: 'block', marginBottom: '0.25rem' }}>Días por semana</label>
                        <select id="tr-days" className={styles.select} value={String(cp.training.daysPerWeek || 0)} onChange={(e) => setTr('daysPerWeek', Number(e.target.value))}>
                            {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n === 0 ? '—' : n}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* --- Texto libre --- */}
            <div className={styles.field}>
                <label className={styles.label} htmlFor="cp-free">Algo más que deba saber la IA (clínico)</label>
                <p className={styles.hint}>
                    Cirugías, diagnósticos en estudio, indicaciones de tu médico… La IA extrae lo relevante.
                </p>
                <textarea
                    id="cp-free" className={styles.textarea}
                    rows={4} maxLength={MAX_FREETEXT}
                    placeholder="Ej. Me quitaron la vesícula en 2024; mi doctora me pidió bajar los triglicéridos…"
                    value={cp.freeText}
                    onChange={(e) => setCp((prev) => ({ ...prev, freeText: e.target.value }))}
                />
                <div className={styles.counter}>{(cp.freeText || '').length}/{MAX_FREETEXT}</div>
            </div>

            <button type="button" className={styles.save} onClick={save} disabled={saving}>
                {saving ? (<><Loader2 className={styles.spin} size={16} /> Guardando…</>) : 'Guardar perfil clínico'}
            </button>
        </div>
    );
}
