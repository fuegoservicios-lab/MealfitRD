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
import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, FlaskConical } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth } from '../../config/api';
import { useAssessment } from '../../context/AssessmentContext';
import useAutoguardado from '../../hooks/useAutoguardado';
import { useT } from '../../i18n';
import styles from './SuperPersonalizationPanel.module.css';
// [P1-I18N-BACKEND-DETAIL · 2026-08-21] El `detail` del servidor viene
// en español SIEMPRE; el `||` hacía que ganara sobre el fallback traducido.
import { mensajeDeError } from '../../utils/errorCopy';

const ENDPOINT = '/api/user/preferences/clinical-profile';
const MAX_FREETEXT = 1500;

const EMPTY = {
    labs: {},
    weightHistory: { unit: 'lb', maxWeight: '', minWeight: '', weight6mAgo: '', unintentionalLoss: false },
    giSymptoms: [],
    training: { type: '', timeOfDay: '', daysPerWeek: 0 },
    freeText: '',
};

/* [P1-I18N-DASHBOARD · 2026-08-15] Las cuatro tablas son FUNCIONES: un `t()` en
   ámbito de módulo se evalúa al importar —antes de que exista el catálogo— y se
   queda en español para siempre sin que nada falle a la vista.

   `key`/`val`/`value`, los min/max y las UNIDADES (mg/dL, %, µUI/mL…) NO pasan por
   el catálogo: los primeros son los identificadores que viajan al backend y las
   segundas son notación clínica internacional, igual en los cinco idiomas. */

// Mismos rangos anti-typo que `_CLINPROF_LAB_RANGES` (backend routers/user_data.py)
// — el backend es SSOT (422 si drift); estos min/max solo dan feedback inmediato.
const getLabFields = (t) => [
    { key: 'glucosa_ayunas', label: t('Glucosa en ayunas'), unit: 'mg/dL', ph: t('Ej. 92'), min: 40, max: 500 },
    { key: 'hba1c', label: 'HbA1c', unit: '%', ph: t('Ej. 5.4'), min: 3, max: 15 },
    { key: 'colesterol_total', label: t('Colesterol total'), unit: 'mg/dL', ph: t('Ej. 180'), min: 80, max: 500 },
    { key: 'ldl', label: 'LDL', unit: 'mg/dL', ph: t('Ej. 100'), min: 30, max: 400 },
    { key: 'hdl', label: 'HDL', unit: 'mg/dL', ph: t('Ej. 50'), min: 10, max: 150 },
    { key: 'trigliceridos', label: t('Triglicéridos'), unit: 'mg/dL', ph: t('Ej. 120'), min: 30, max: 2000 },
    { key: 'creatinina', label: t('Creatinina'), unit: 'mg/dL', ph: t('Ej. 0.9'), min: 0.2, max: 15 },
    { key: 'tfg', label: t('TFG (filtrado renal)'), unit: 'mL/min', ph: t('Ej. 95'), min: 5, max: 150 },
    { key: 'tsh', label: 'TSH', unit: 'µUI/mL', ph: t('Ej. 2.1'), min: 0.01, max: 100 },
    { key: 'acido_urico', label: t('Ácido úrico'), unit: 'mg/dL', ph: t('Ej. 5.5'), min: 1, max: 15 },
    { key: 'hemoglobina', label: t('Hemoglobina'), unit: 'g/dL', ph: t('Ej. 14'), min: 5, max: 22 },
    { key: 'vitamina_d', label: t('Vitamina D'), unit: 'ng/mL', ph: t('Ej. 32'), min: 4, max: 150 },
];

const getGiOptions = (t) => [
    { val: 'reflujo', label: t('Reflujo / acidez') },
    { val: 'estrenimiento', label: t('Estreñimiento') },
    { val: 'diarrea', label: t('Diarrea frecuente') },
    { val: 'distension', label: t('Distensión / gases') },
    { val: 'ninguno', label: t('Ninguno') },
];

const getTrainingTypes = (t) => [
    { value: '', label: t('Sin especificar') },
    { value: 'fuerza', label: t('Fuerza / pesas') },
    { value: 'cardio', label: t('Cardio') },
    { value: 'mixto', label: t('Mixto (fuerza + cardio)') },
    { value: 'crossfit', label: t('CrossFit / funcional') },
    { value: 'calistenia', label: t('Calistenia') },
    { value: 'deporte', label: t('Deporte (baloncesto, béisbol…)') },
];

const getTrainingTimes = (t) => [
    { value: '', label: '—' },
    { value: 'manana', label: t('Mañana') },
    { value: 'mediodia', label: t('Mediodía') },
    { value: 'tarde', label: t('Tarde') },
    { value: 'noche', label: t('Noche') },
];

export default function ClinicalProfilePanel({ onSaved, onEstado }) {
    const t = useT();
    const { updateData } = useAssessment();
    const [cp, setCp] = useState(EMPTY);
    const [loading, setLoading] = useState(true);
    // [P1-CLINICAL-FAIL-CLOSED · 2026-08-11] Ver el comentario de `load`.
    const [loadFailed, setLoadFailed] = useState(false);

    /* [P1-CLINICAL-FAIL-CLOSED · 2026-08-11] Este panel era el único de los tres SIN
       el guard de P2-SUPERPERS-FAIL-CLOSED, y además tragaba los errores del servidor:
       el `if (res.ok)` no tenía `else`, así que un 4xx/5xx salía por el `finally` sin
       tocar el estado, sin toast y sin bloquear nada. El usuario veía su perfil clínico
       VACÍO —laboratorios en blanco, síntomas desmarcados, texto libre borrado— con el
       botón «Guardar perfil clínico» tan activo como siempre. Pulsarlo escribía ese
       vacío encima de sus datos reales.

       No era teórico: es exactamente el defecto que ya ocurrió en Súper Personalización
       en julio y que allí se cerró. Aquí seguía abierto porque el `catch` solo atrapa
       fallos de RED, y un 500 del servidor no es un fallo de red — es una respuesta.

       Mismo remedio, misma forma: un reintento a los 800ms y, si tampoco, panel
       BLOQUEADO con «Reintentar» en vez de un formulario vacío que se pueda guardar.
       Fail-closed: ante la duda, no dejar escribir.

       Cobra doble importancia con el autoguardado: sin botón que bloquear, bastaría con
       rozar un chip para perder el perfil. */
    const load = useCallback(async (attempt = 0) => {
        setLoading(true);
        setLoadFailed(false);
        let willRetry = false;
        try {
            const res = await fetchWithAuth(ENDPOINT);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
        } catch {
            if (attempt < 1) {
                willRetry = true;
                setTimeout(() => load(attempt + 1), 800);
            } else {
                setLoadFailed(true);
                toast.error(t('No se pudo cargar tu perfil clínico.'));
            }
        } finally {
            if (!willRetry) setLoading(false);
        }
        // `t` es referencialmente estable (el motor devuelve siempre la misma
        // función); va en las deps solo para no dejar el hook incompleto.
    }, [t]);

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

    /* [P1-SETTINGS-AUTOSAVE · 2026-08-11] Sin botón: el panel se guarda solo.

       `freeText` va en AL_VOLCAR por la misma razón que en Súper Personalización: cada
       PUT con el texto cambiado dispara `async_extract_and_save_facts`
       (routers/user_data.py:1197) — LLM + embedding. Sale al salir del campo, al cerrar
       y al irse la página, nunca por temporizador.

       Los laboratorios NO son instantáneos: se teclean, y un temporizador de 400 ms
       dispararía a mitad de un número («9» camino de «92»). Caen en la clase lenta por
       defecto, que es justo para lo que existe.

       El guard de P1-CLINICAL-FAIL-CLOSED viaja aquí a través de `habilitado`: sin una
       carga con éxito el hook no tiene base y no escribe. Sin botón, el guard del botón
       ya no protegería a nadie. */
    /* El 422 («ese número no puede ser») ya tiene su propio aviso dentro de `guardar`.
       Sin esta marca saldrían DOS toasts por el mismo fallo: el específico y el
       genérico de abajo — y el genérico es el que menos ayuda. */
    const fueRangoRef = useRef(false);

    const guardar = useCallback(async (v, opciones = {}) => {
        fueRangoRef.current = false;
        const body = {
            labs: v.labs,
            weightHistory: v.weightHistory,
            giSymptoms: v.giSymptoms,
            training: v.training,
            freeText: (v.freeText || '').slice(0, MAX_FREETEXT),
        };
        const res = await fetchWithAuth(ENDPOINT, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            ...(opciones.keepalive ? { keepalive: true } : {}),
        });
        if (res.status === 422) {
            // Un valor fuera de rango no es un fallo de guardado: es el backend
            // diciendo que ese número no puede ser. Se avisa y NO se relanza, para que
            // el acuse no se quede en «error» por algo que el usuario tiene que
            // corregir él — pero tampoco se adopta como base, así que en cuanto lo
            // arregle volverá a intentarlo solo.
            const err = await res.json().catch(() => null);
            fueRangoRef.current = true;
            toast.error(mensajeDeError(err, t('Revisa los valores: hay alguno fuera de rango.'), t));
            throw new Error('422');
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const saved = data?.clinical_profile || body;
        try { updateData('clinical_profile', saved); } catch { /* no-op */ }
        if (onSaved) onSaved(saved);
        return undefined;
    }, [onSaved, updateData, t]);

    const { estado, volcar } = useAutoguardado({
        valor: cp,
        guardar,
        habilitado: !loading && !loadFailed,
        instantaneos: ['giSymptoms', 'training'],
        alVolcar: ['freeText'],
        onEstado,
    });

    // Los otros dos paneles avisan de un guardado fallido; este no lo hacía, y sin
    // botón el usuario no tendría NINGUNA señal de que su cambio no llegó.
    useEffect(() => {
        if (estado === 'error' && !fueRangoRef.current) {
            toast.error(t('No se pudo guardar tu perfil clínico.'));
        }
    }, [estado, t]);

    if (loading) {
        return (
            <div className={styles.loading}>
                <Loader2 className={styles.spin} size={22} /> {t('Cargando…')}
            </div>
        );
    }

    // [P1-CLINICAL-FAIL-CLOSED · 2026-08-11] Carga fallida → panel bloqueado con
    // reintento, NUNCA un formulario vacío editable: guardarlo pisaría el perfil real.
    // Es el mismo cierre que P2-SUPERPERS-FAIL-CLOSED, que aquí faltaba.
    if (loadFailed) {
        return (
            <div className={styles.loading}>
                <span>{t('No pudimos cargar tu perfil clínico. Revisa tu conexión.')}</span>
                <button type="button" className={styles.save} onClick={() => load()}>
                    {t('Reintentar')}
                </button>
            </div>
        );
    }

    return (
        <div className={styles.panel}>
            <div className={styles.intro}>
                <div className={styles.introIcon}><FlaskConical size={20} /></div>
                {/* Cinco claves: los dos `<strong>` son marcado y no caben dentro de
                    una clave del catálogo (el motor traduce cadenas, no árboles JSX). */}
                <p>
                    {t('Datos de nivel consulta: laboratorios, historial de peso, digestión y entrenamiento. Todo es')} <strong>{t('opcional')}</strong> {t('— mientras más completes, más precisa la calibración.')} <strong>{t('No sustituye diagnóstico médico')}</strong>: {t('si un valor sugiere algo, la IA lo usará con prudencia y te recomendará confirmarlo con un profesional.')}
                </p>
            </div>

            {/* --- Laboratorios --- */}
            <div className={styles.field}>
                <label className={styles.label}>{t('Laboratorios recientes')}</label>
                <p className={styles.hint}>
                    {t('Copia los valores de tu último análisis (deja vacío lo que no tengas).')}
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '0.75rem' }}>
                    {getLabFields(t).map((f) => (
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
                        {t('Fecha del análisis (aprox.)')}
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
                <label className={styles.label}>{t('Historial de peso')}</label>
                <p className={styles.hint}>
                    {t('Tu trayectoria de peso ayuda a calibrar el ritmo (dietas repetidas = metabolismo adaptado).')}
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
                        { key: 'maxWeight', label: t('Peso máximo') },
                        { key: 'minWeight', label: t('Peso mínimo (adulto)') },
                        { key: 'weight6mAgo', label: t('Peso hace 6 meses') },
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
                        {t('He perdido peso sin proponérmelo últimamente')}
                    </button>
                </div>
            </div>

            {/* --- Síntomas digestivos --- */}
            <div className={styles.field}>
                <label className={styles.label}>{t('Digestión')}</label>
                <p className={styles.hint}>{t('Marca lo que te pasa con frecuencia — el menú se adapta.')}</p>
                <div className={styles.chips}>
                    {getGiOptions(t).map((o) => (
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
                <label className={styles.label}>{t('Entrenamiento')}</label>
                <p className={styles.hint}>
                    {t('Con tipo y horario, la IA coloca los carbohidratos y la proteína alrededor de tu entreno.')}
                </p>
                <div className={styles.row}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                        <label className={styles.hint} htmlFor="tr-type" style={{ display: 'block', marginBottom: '0.25rem' }}>{t('Tipo')}</label>
                        <select id="tr-type" className={styles.select} value={cp.training.type} onChange={(e) => setTr('type', e.target.value)}>
                            {getTrainingTypes(t).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>
                    <div style={{ flex: 1, minWidth: 140 }}>
                        <label className={styles.hint} htmlFor="tr-time" style={{ display: 'block', marginBottom: '0.25rem' }}>{t('Horario habitual')}</label>
                        <select id="tr-time" className={styles.select} value={cp.training.timeOfDay} onChange={(e) => setTr('timeOfDay', e.target.value)}>
                            {getTrainingTimes(t).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>
                    <div style={{ flex: 1, minWidth: 140 }}>
                        <label className={styles.hint} htmlFor="tr-days" style={{ display: 'block', marginBottom: '0.25rem' }}>{t('Días por semana')}</label>
                        <select id="tr-days" className={styles.select} value={String(cp.training.daysPerWeek || 0)} onChange={(e) => setTr('daysPerWeek', Number(e.target.value))}>
                            {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n === 0 ? '—' : n}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* --- Texto libre --- */}
            <div className={styles.field}>
                <label className={styles.label} htmlFor="cp-free">{t('Algo más que deba saber la IA (clínico)')}</label>
                <p className={styles.hint}>
                    {t('Cirugías, diagnósticos en estudio, indicaciones de tu médico… La IA extrae lo relevante.')}
                </p>
                <textarea
                    id="cp-free" className={styles.textarea}
                    rows={4} maxLength={MAX_FREETEXT}
                    placeholder={t('Ej. Me quitaron la vesícula en 2024; mi doctora me pidió bajar los triglicéridos…')}
                    value={cp.freeText}
                    onChange={(e) => setCp((prev) => ({ ...prev, freeText: e.target.value }))}
                    onBlur={() => volcar()}
                />
                <div className={styles.counter}>{(cp.freeText || '').length}/{MAX_FREETEXT}</div>
            </div>

        </div>
    );
}
