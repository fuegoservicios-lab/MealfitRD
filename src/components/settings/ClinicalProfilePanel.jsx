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
import { useState, useEffect, useCallback, useRef, useId } from 'react';
import { Loader2, FlaskConical } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth } from '../../config/api';
import { useAssessment } from '../../context/AssessmentContext';
import useAutoguardado, { claveEstable, enviarAlIrse } from '../../hooks/useAutoguardado';
import { useLatestRef } from '../../hooks/useLatestRef';
import { useI18n, useT } from '../../i18n';
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
// [P1-PLAN-LOTE-718 · 2026-09-28] Fuera de la tabla con copy: la validación los usa sin `t`.
const RANGOS_LAB = {
    glucosa_ayunas: [40, 500],
    hba1c: [3, 15],
    colesterol_total: [80, 500],
    ldl: [30, 400],
    hdl: [10, 150],
    trigliceridos: [30, 2000],
    creatinina: [0.2, 15],
    tfg: [5, 150],
    tsh: [0.01, 100],
    acido_urico: [1, 15],
    hemoglobina: [5, 22],
    vitamina_d: [4, 150],
};
// `_CLINPROF_WEIGHT_RANGE` del backend: genérico lb/kg, solo anti-typo.
const RANGO_PESO = [20, 700];
const CLAVES_PESO = ['maxWeight', 'minWeight', 'weight6mAgo'];

const getLabFields = (t) => [
    { key: 'glucosa_ayunas', label: t('Glucosa en ayunas'), unit: 'mg/dL', ph: t('Ej. 92') },
    { key: 'hba1c', label: 'HbA1c', unit: '%', ph: t('Ej. 5.4') },
    { key: 'colesterol_total', label: t('Colesterol total'), unit: 'mg/dL', ph: t('Ej. 180') },
    { key: 'ldl', label: 'LDL', unit: 'mg/dL', ph: t('Ej. 100') },
    { key: 'hdl', label: 'HDL', unit: 'mg/dL', ph: t('Ej. 50') },
    { key: 'trigliceridos', label: t('Triglicéridos'), unit: 'mg/dL', ph: t('Ej. 120') },
    { key: 'creatinina', label: t('Creatinina'), unit: 'mg/dL', ph: t('Ej. 0.9') },
    { key: 'tfg', label: t('TFG (filtrado renal)'), unit: 'mL/min', ph: t('Ej. 95') },
    { key: 'tsh', label: 'TSH', unit: 'µUI/mL', ph: t('Ej. 2.1') },
    { key: 'acido_urico', label: t('Ácido úrico'), unit: 'mg/dL', ph: t('Ej. 5.5') },
    { key: 'hemoglobina', label: t('Hemoglobina'), unit: 'g/dL', ph: t('Ej. 14') },
    { key: 'vitamina_d', label: t('Vitamina D'), unit: 'ng/mL', ph: t('Ej. 32') },
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

/* [P1-PLAN-LOTE-718 · 2026-09-28] Números con coma decimal.
   Los campos eran `type="number"`: en francés, italiano y portugués la coma es el
   separador decimal, y un `<input type="number">` que recibe «5,4» en un navegador
   que no la acepta entrega `value === ''` — el dato se perdía EN SILENCIO y el panel
   guardaba el campo vacío. Ahora son texto con teclado decimal y se leen aquí:
   «5,4» y «5.4» valen 5.4 (el backend también acepta la coma, `_clinprof_num`).
   '' ⇒ null (campo vacío, se borra a propósito); cualquier otra cosa ⇒ NaN. */
function leerDecimal(valor) {
    if (valor === null || valor === undefined) return null;
    if (typeof valor === 'number') return Number.isFinite(valor) ? valor : Number.NaN;
    const s = String(valor).trim().replace(/\s+/g, '');
    if (!s) return null;
    if (!/^\d*(?:[.,]\d*)?$/.test(s) || !/\d/.test(s)) return Number.NaN;
    return Number(s.replace(',', '.'));
}

/** Solo lo que un campo decimal puede contener: cifras y UN separador (se quitan letras, %, espacios). */
const limpiarDecimal = (texto) => String(texto ?? '').replace(/[^\d.,]/g, '');

/** El número dentro de rango, o `null` si no lo es (vacío, basura o fuera de rango). */
function numeroValido(valor, [min, max]) {
    const n = leerDecimal(valor);
    return n !== null && !Number.isNaN(n) && n >= min && n <= max ? n : null;
}

/** Errores de lo tecleado, por ruta (`labs.hba1c`, `weightHistory.minWeight`…). Puro. */
function erroresDelPerfil(cp) {
    const errores = {};
    const revisar = (ruta, valor, [min, max]) => {
        const n = leerDecimal(valor);
        if (n === null) return null;
        if (Number.isNaN(n)) { errores[ruta] = { tipo: 'numero' }; return null; }
        if (n < min || n > max) { errores[ruta] = { tipo: 'rango', min, max }; return null; }
        return n;
    };
    Object.entries(RANGOS_LAB).forEach(([k, rango]) => revisar(`labs.${k}`, cp?.labs?.[k], rango));
    const pesos = {};
    CLAVES_PESO.forEach((k) => { pesos[k] = revisar(`weightHistory.${k}`, cp?.weightHistory?.[k], RANGO_PESO); });
    // [P1-PLAN-LOTE-718] Mínimo por encima del máximo: los dos números son válidos por
    // separado y juntos son imposibles. No se sabe cuál está mal, así que no viaja ninguno.
    if (pesos.maxWeight !== null && pesos.minWeight !== null && pesos.minWeight > pesos.maxWeight) {
        errores['weightHistory.minWeight'] = { tipo: 'orden' };
        errores['weightHistory.maxWeight'] = { tipo: 'orden', sinTexto: true };
    }
    return errores;
}

/* [P1-PLAN-LOTE-718 · 2026-09-28] Un 422 ya no bloquea el panel ENTERO.
   El endpoint REEMPLAZA `clinical_profile` completo, así que un solo número fuera de
   rango hacía fallar cada PUT: ni ese campo ni ningún otro cambio se guardaba, y el
   aviso era un toast genérico que no decía cuál. Ahora el cuerpo se arma campo a campo:
   lo que no vale viaja con su ÚLTIMO valor aceptado por el servidor (`aceptado`) y el
   campo se marca en línea. `vaciar` es el último recurso: el servidor rechazó incluso
   su propio valor aceptado (sus reglas cambiaron) — entonces ese campo va vacío. */
function cuerpoParaGuardar(v, excluir, vaciar, aceptado) {
    const excluida = (ruta) => excluir.has(ruta) || excluir.has(ruta.split('.')[0]);
    const vaciada = (ruta) => vaciar.has(ruta) || vaciar.has(ruta.split('.')[0]);
    const origen = (ruta, propio, delServidor) => (excluida(ruta) ? delServidor : propio);

    const labs = {};
    Object.entries(RANGOS_LAB).forEach(([k, rango]) => {
        const ruta = `labs.${k}`;
        if (vaciada(ruta)) return;
        const n = numeroValido(origen(ruta, v?.labs?.[k], aceptado?.labs?.[k]), rango);
        if (n !== null) labs[k] = n;
    });
    const fecha = vaciada('labs.labsDate') ? '' : origen('labs.labsDate', v?.labs?.labsDate, aceptado?.labs?.labsDate);
    if (fecha) labs.labsDate = fecha;

    const whV = v?.weightHistory || {};
    const whA = aceptado?.weightHistory || {};
    const weightHistory = {
        unit: vaciada('weightHistory.unit') ? '' : (origen('weightHistory.unit', whV.unit, whA.unit) || whV.unit || ''),
        unintentionalLoss: !!origen('weightHistory.unintentionalLoss', whV.unintentionalLoss, whA.unintentionalLoss),
    };
    CLAVES_PESO.forEach((k) => {
        const ruta = `weightHistory.${k}`;
        const n = vaciada(ruta) ? null : numeroValido(origen(ruta, whV[k], whA[k]), RANGO_PESO);
        weightHistory[k] = n === null ? '' : n;
    });

    const trV = v?.training || EMPTY.training;
    const trA = { ...EMPTY.training, ...(aceptado?.training || {}) };
    const training = {};
    ['type', 'timeOfDay', 'daysPerWeek'].forEach((k) => {
        const ruta = `training.${k}`;
        training[k] = vaciada(ruta) ? EMPTY.training[k] : origen(ruta, trV[k], trA[k]);
    });

    const giSymptoms = vaciada('giSymptoms') ? [] : (origen('giSymptoms', v?.giSymptoms, aceptado?.giSymptoms) || []);
    const freeText = vaciada('freeText') ? '' : String(origen('freeText', v?.freeText, aceptado?.freeText) || '');

    return {
        labs,
        weightHistory,
        giSymptoms,
        training,
        freeText: freeText.slice(0, MAX_FREETEXT),
    };
}

const RAICES = ['labs', 'weightHistory', 'giSymptoms', 'training', 'freeText'];

/** El campo que señala un 422 del backend, como ruta del panel, o null si no se sabe.
 *  Hoy el backend lo dice DENTRO de la frase (`'hba1c' fuera de rango plausible…`,
 *  `training.type inválido.`, `'weightHistory.maxWeight' debe ser numérico.`); se
 *  aceptan también las formas estructuradas por si un día cambia (`{field}`, la lista
 *  `loc` de la validación de FastAPI). */
function rutaDelError(err) {
    const d = err && err.detail;
    let campo = null;
    if (d && typeof d === 'object' && !Array.isArray(d)) {
        campo = d.field || d.campo || (Array.isArray(d.loc) ? d.loc.filter((x) => x !== 'body').join('.') : null);
    } else if (Array.isArray(d) && d[0] && Array.isArray(d[0].loc)) {
        campo = d[0].loc.filter((x) => x !== 'body').join('.');
    } else if (typeof d === 'string') {
        const m = d.match(/^'([A-Za-z_][\w.]*)'/) || d.match(/^([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?)\b/);
        campo = m ? m[1] : null;
    }
    if (!campo || typeof campo !== 'string') return null;
    if (Object.prototype.hasOwnProperty.call(RANGOS_LAB, campo)) return `labs.${campo}`;
    if (campo === 'labsDate') return 'labs.labsDate';
    return RAICES.includes(campo.split('.')[0]) ? campo : null;
}

/** La unidad del peso con la que nace el panel: la del perfil (`health_profile.weightUnit`),
 *  luego la del formulario, y si no, libras. */
function unidadDePeso(userProfile, formData) {
    const u = String(userProfile?.health_profile?.weightUnit || formData?.weightUnit || '').trim().toLowerCase();
    return u === 'kg' ? 'kg' : 'lb';
}

export default function ClinicalProfilePanel({ onSaved, onEstado }) {
    const t = useT();
    const { locale } = useI18n();
    const { updateData, formData, userProfile } = useAssessment();
    // [P1-PLAN-LOTE-718 · 2026-09-28] Por ref: `updateData` es una función nueva en cada render
    // del proveedor y `load` no puede depender de ella (su efecto se re-dispararía en bucle).
    const updateDataRef = useLatestRef(updateData);
    const formDataRef = useLatestRef(formData);
    const unidadDelPerfilRef = useLatestRef(unidadDePeso(userProfile, formData));
    const idBase = useId();
    const [cp, setCp] = useState(EMPTY);
    const [loading, setLoading] = useState(true);
    // [P1-CLINICAL-FAIL-CLOSED · 2026-08-11] Ver el comentario de `load`.
    const [loadFailed, setLoadFailed] = useState(false);
    // [P1-PLAN-LOTE-718] Lo último que el SERVIDOR aceptó: es lo que viaja en lugar de un
    // campo inválido, para que el resto del panel se pueda guardar.
    const aceptadoRef = useRef(null);
    // Campos que el servidor rechazó (422) y que el usuario no ha vuelto a tocar.
    const [erroresServidor, setErroresServidor] = useState({});
    const erroresServidorRef = useLatestRef(erroresServidor);
    // Campos cuyo error local ya se puede enseñar: al salir del campo, o cuando un guardado
    // lo tuvo que dejar fuera. Mientras se teclea «1» camino de «120» no se regaña a nadie.
    const [visibles, setVisibles] = useState(() => new Set());

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
            const whServidor = (p.weightHistory && typeof p.weightHistory === 'object') ? p.weightHistory : {};
            // [P1-PLAN-LOTE-718 · 2026-09-28] La unidad nacía en 'lb' para todo el mundo: quien
            // pesa en kg veía «Peso máximo (lb)». Sin pesos guardados, manda la unidad del
            // perfil (la 'lb' guardada entonces era solo aquel valor por defecto); con pesos,
            // la unidad con la que se escribieron.
            const tienePesos = CLAVES_PESO.some((k) => leerDecimal(whServidor[k]) !== null);
            const unidadGuardada = whServidor.unit === 'kg' || whServidor.unit === 'lb' ? whServidor.unit : null;
            setCp({
                ...EMPTY,
                labs: (p.labs && typeof p.labs === 'object') ? p.labs : {},
                weightHistory: {
                    ...EMPTY.weightHistory,
                    ...whServidor,
                    unit: (tienePesos && unidadGuardada) || unidadDelPerfilRef.current,
                },
                giSymptoms: Array.isArray(p.giSymptoms) ? p.giSymptoms : [],
                training: { ...EMPTY.training, ...((p.training && typeof p.training === 'object') ? p.training : {}) },
                freeText: typeof p.freeText === 'string' ? p.freeText : '',
            });
            aceptadoRef.current = p;
            setErroresServidor({});
            // [P1-PLAN-LOTE-718] La copia de `formData` se pone al día con el servidor al CARGAR,
            // no solo al guardar: si no, la próxima renovación del plan devolvía al servidor una
            // versión vieja (editada en otro dispositivo) dentro del health_profile.
            if (claveEstable(formDataRef.current?.clinical_profile ?? null) !== claveEstable(p)) {
                try { updateDataRef.current('clinical_profile', p); } catch { /* no-op */ }
            }
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
        // función); va en las deps solo para no dejar el hook incompleto. Los refs,
        // también: useLatestRef devuelve siempre el mismo objeto.
    }, [t, formDataRef, updateDataRef, unidadDelPerfilRef]);

    useEffect(() => { load(); }, [load]);

    /** Tocar un campo retira el rechazo del servidor sobre él: la próxima vez viaja. */
    const olvidarRechazo = (...rutas) => setErroresServidor((prev) => {
        const siguen = rutas.filter((r) => r in prev);
        if (!siguen.length) return prev;
        const nuevo = { ...prev };
        siguen.forEach((r) => { delete nuevo[r]; });
        return nuevo;
    });
    const mostrarError = (ruta) => setVisibles((prev) => (prev.has(ruta) ? prev : new Set([...prev, ruta])));

    const setLab = (k, v) => {
        olvidarRechazo(`labs.${k}`, 'labs');
        setCp((prev) => ({ ...prev, labs: { ...prev.labs, [k]: limpiarDecimal(v) } }));
    };
    const setLabsDate = (v) => {
        olvidarRechazo('labs.labsDate', 'labs');
        setCp((prev) => ({ ...prev, labs: { ...prev.labs, labsDate: v } }));
    };
    const setWh = (k, v) => {
        olvidarRechazo(`weightHistory.${k}`, 'weightHistory');
        setCp((prev) => ({ ...prev, weightHistory: { ...prev.weightHistory, [k]: v } }));
    };
    const setTr = (k, v) => {
        olvidarRechazo(`training.${k}`, 'training');
        setCp((prev) => ({ ...prev, training: { ...prev.training, [k]: v } }));
    };
    // Sentinel 'ninguno' exclusivo — misma regla que los multi-select del wizard
    // (el backend la re-aplica igual; esto solo evita el estado contradictorio en UI).
    const toggleGi = (val) => {
        olvidarRechazo('giSymptoms');
        setCp((prev) => {
            const cur = prev.giSymptoms;
            if (cur.includes(val)) return { ...prev, giSymptoms: cur.filter((x) => x !== val) };
            if (val === 'ninguno') return { ...prev, giSymptoms: ['ninguno'] };
            return { ...prev, giSymptoms: [...cur.filter((x) => x !== 'ninguno'), val] };
        });
    };

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
    /* El 422 que no se sabe atribuir a un campo sigue teniendo su propio aviso dentro de
       `guardar`. Sin esta marca saldrían DOS toasts por el mismo fallo: el específico y el
       genérico de abajo — y el genérico es el que menos ayuda. */
    const fueRangoRef = useRef(false);

    const guardar = useCallback(async (v, opciones = {}) => {
        fueRangoRef.current = false;
        // [P1-PLAN-LOTE-718] Lo que no vale NO viaja con lo tecleado (viaja lo último aceptado),
        // y lo demás se guarda. Antes un solo campo malo tumbaba el PUT entero, cada vez.
        const locales = erroresDelPerfil(v);
        const excluir = new Set([...Object.keys(locales), ...Object.keys(erroresServidorRef.current || {})]);
        const vaciar = new Set();
        const rechazadosAhora = {};
        for (let intento = 0; intento < 5; intento += 1) {
            const body = cuerpoParaGuardar(v, excluir, vaciar, aceptadoRef.current);
            const init = {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            };
            // [P1-PLAN-LOTE-718] Al irse la página, el PUT sale en ESTE tic (ver `enviarAlIrse`).
            const res = opciones.keepalive ? await enviarAlIrse(ENDPOINT, init) : await fetchWithAuth(ENDPOINT, init);
            if (res.status === 422) {
                // Un valor fuera de rango no es un fallo de guardado: es el backend diciendo
                // que ese número no puede ser. Si dice CUÁL, ese campo se marca en línea y el
                // PUT se repite sin él; el resto de los cambios no tiene por qué esperar.
                const err = await res.json().catch(() => null);
                const ruta = rutaDelError(err);
                if (ruta && !excluir.has(ruta)) {
                    excluir.add(ruta);
                    rechazadosAhora[ruta] = true;
                    continue;
                }
                if (ruta && !vaciar.has(ruta)) {
                    // Ya viajaba con lo aceptado y aun así no vale: sus reglas cambiaron.
                    vaciar.add(ruta);
                    rechazadosAhora[ruta] = true;
                    continue;
                }
                // Sin campo reconocible: el aviso de siempre, y NO se adopta como base, así
                // que en cuanto se corrija volverá a intentarlo solo.
                fueRangoRef.current = true;
                toast.error(mensajeDeError(err, t('Revisa los valores: hay alguno fuera de rango.'), t));
                throw new Error('422');
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const saved = data?.clinical_profile || body;
            aceptadoRef.current = saved;
            if (Object.keys(rechazadosAhora).length) setErroresServidor((prev) => ({ ...prev, ...rechazadosAhora }));
            if (Object.keys(locales).length) setVisibles((prev) => new Set([...prev, ...Object.keys(locales)]));
            try { updateData('clinical_profile', saved); } catch { /* no-op */ }
            if (onSaved) onSaved(saved);
            return undefined;
        }
        fueRangoRef.current = true;
        toast.error(t('Revisa los valores: hay alguno fuera de rango.'));
        throw new Error('422');
    }, [onSaved, updateData, t, erroresServidorRef]);

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
            <div className={styles.loading} role="status">
                <Loader2 className={styles.spin} size={22} aria-hidden="true" /> {t('Cargando…')}
            </div>
        );
    }

    // [P1-CLINICAL-FAIL-CLOSED · 2026-08-11] Carga fallida → panel bloqueado con
    // reintento, NUNCA un formulario vacío editable: guardarlo pisaría el perfil real.
    // Es el mismo cierre que P2-SUPERPERS-FAIL-CLOSED, que aquí faltaba.
    if (loadFailed) {
        return (
            <div className={styles.loading}>
                <span role="alert">{t('No pudimos cargar tu perfil clínico. Revisa tu conexión.')}</span>
                <button type="button" className={styles.save} onClick={() => load()}>
                    {t('Reintentar')}
                </button>
            </div>
        );
    }

    // [P1-PLAN-LOTE-718 · 2026-09-28] Qué decir bajo cada campo. Los errores locales esperan a
    // que el campo se abandone (o a que un guardado lo deje fuera); el rechazo del servidor
    // se dice siempre, porque ya pasó.
    const errores = erroresDelPerfil(cp);
    const formatear = (n) => {
        try { return new Intl.NumberFormat(locale || undefined, { maximumFractionDigits: 2 }).format(n); } catch { return String(n); }
    };
    const mensajeDe = (ruta) => {
        const e = errores[ruta];
        if (e && visibles.has(ruta)) {
            if (e.sinTexto) return '';
            if (e.tipo === 'numero') return t('Escribe solo un número; puedes usar coma o punto para los decimales.');
            if (e.tipo === 'rango') return t('Tiene que estar entre {min} y {max}. Este valor todavía no se ha guardado.', { min: formatear(e.min), max: formatear(e.max) });
            if (e.tipo === 'orden') return t('El peso mínimo no puede ser mayor que el máximo. Estos dos valores todavía no se han guardado.');
        }
        if (erroresServidor[ruta]) return t('Este valor no se pudo guardar; revísalo. El resto de tus cambios sí se guardó.');
        return '';
    };
    const invalido = (ruta) => !!(erroresServidor[ruta] || (errores[ruta] && visibles.has(ruta)));
    /** Rechazos del servidor sobre un grupo que no es un campo concreto (la unidad, los síntomas…). */
    const mensajeDeGrupo = (...rutas) => (rutas.some((r) => erroresServidor[r])
        ? t('Este valor no se pudo guardar; revísalo. El resto de tus cambios sí se guardó.')
        : '');
    // Los números del servidor llegan con punto: se pintan con el separador del idioma
    // (5,4 en francés), que es como la persona los escribiría. Lo tecleado, tal cual.
    const separador = (() => {
        try { return (1.5).toLocaleString(locale || undefined).includes(',') ? ',' : '.'; } catch { return '.'; }
    })();
    const mostrarDecimal = (valor) => (typeof valor === 'number' && Number.isFinite(valor)
        ? String(valor).replace('.', separador)
        : (valor ?? ''));
    const id = (sufijo) => `${idBase}-${sufijo}`;

    return (
        <div className={styles.panel}>
            <div className={styles.intro}>
                <div className={styles.introIcon}><FlaskConical size={20} aria-hidden="true" /></div>
                {/* Cinco claves: los dos `<strong>` son marcado y no caben dentro de
                    una clave del catálogo (el motor traduce cadenas, no árboles JSX). */}
                <p>
                    {t('Datos de nivel consulta: laboratorios, historial de peso, digestión y entrenamiento. Todo es')} <strong>{t('opcional')}</strong> {t('— mientras más completes, más precisa la calibración.')} <strong>{t('No sustituye diagnóstico médico')}</strong>: {t('si un valor sugiere algo, la IA lo usará con prudencia y te recomendará confirmarlo con un profesional.')}
                </p>
            </div>

            {/* --- Laboratorios ---
                [P1-PLAN-LOTE-718 · 2026-09-28] Los rótulos de sección eran `<label>` sin control:
                no nombraban nada. Cada sección es un grupo con nombre (`role="group"`). */}
            <div className={styles.field} role="group" aria-labelledby={id('labs')} aria-describedby={id('labs-pista')}>
                <span className={styles.label} id={id('labs')}>{t('Laboratorios recientes')}</span>
                <p className={styles.hint} id={id('labs-pista')}>
                    {t('Copia los valores de tu último análisis (deja vacío lo que no tengas).')}
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '0.75rem' }}>
                    {getLabFields(t).map((f) => {
                        const ruta = `labs.${f.key}`;
                        return (
                            <div key={f.key}>
                                <label className={styles.hint} htmlFor={`lab-${f.key}`} style={{ display: 'block', marginBottom: '0.25rem' }}>
                                    {f.label} ({f.unit})
                                </label>
                                <input
                                    id={`lab-${f.key}`}
                                    className={styles.select}
                                    type="text" inputMode="decimal" autoComplete="off"
                                    placeholder={f.ph}
                                    value={mostrarDecimal(cp.labs[f.key])}
                                    onChange={(e) => setLab(f.key, e.target.value)}
                                    onBlur={() => mostrarError(ruta)}
                                    aria-invalid={invalido(ruta) || undefined}
                                    aria-describedby={id(`err-${f.key}`)}
                                />
                                <p id={id(`err-${f.key}`)} className={styles.fieldError} aria-live="polite">{mensajeDe(ruta)}</p>
                            </div>
                        );
                    })}
                </div>
                <div style={{ marginTop: '0.75rem', maxWidth: 240 }}>
                    <label className={styles.hint} htmlFor="lab-date" style={{ display: 'block', marginBottom: '0.25rem' }}>
                        {t('Fecha del análisis (aprox.)')}
                    </label>
                    <input
                        id="lab-date" className={styles.select} type="month"
                        value={cp.labs.labsDate ?? ''}
                        onChange={(e) => setLabsDate(e.target.value)}
                        aria-invalid={invalido('labs.labsDate') || undefined}
                        aria-describedby={id('err-fecha')}
                    />
                    <p id={id('err-fecha')} className={styles.fieldError} aria-live="polite">{mensajeDe('labs.labsDate')}</p>
                </div>
                <p className={styles.fieldError} aria-live="polite">{mensajeDeGrupo('labs')}</p>
            </div>

            {/* --- Historia ponderal --- */}
            <div className={styles.field} role="group" aria-labelledby={id('peso')} aria-describedby={id('peso-pista')}>
                <span className={styles.label} id={id('peso')}>{t('Historial de peso')}</span>
                <p className={styles.hint} id={id('peso-pista')}>
                    {t('Tu trayectoria de peso ayuda a calibrar el ritmo (dietas repetidas = metabolismo adaptado).')}
                </p>
                <div className={styles.chips} style={{ marginBottom: '0.6rem' }} role="group" aria-label={t('Unidad de peso')}>
                    {['lb', 'kg'].map((u) => (
                        <button
                            key={u} type="button"
                            className={`${styles.chip} ${cp.weightHistory.unit === u ? styles.chipActive : ''}`}
                            onClick={() => setWh('unit', u)}
                            aria-pressed={cp.weightHistory.unit === u}
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
                    ].map((f) => {
                        const ruta = `weightHistory.${f.key}`;
                        return (
                            <div key={f.key}>
                                <label className={styles.hint} htmlFor={`wh-${f.key}`} style={{ display: 'block', marginBottom: '0.25rem' }}>
                                    {f.label} ({cp.weightHistory.unit})
                                </label>
                                <input
                                    id={`wh-${f.key}`} className={styles.select}
                                    type="text" inputMode="decimal" autoComplete="off"
                                    value={mostrarDecimal(cp.weightHistory[f.key])}
                                    onChange={(e) => setWh(f.key, limpiarDecimal(e.target.value))}
                                    onBlur={() => mostrarError(ruta)}
                                    aria-invalid={invalido(ruta) || undefined}
                                    aria-describedby={id(`err-${f.key}`)}
                                />
                                <p id={id(`err-${f.key}`)} className={styles.fieldError} aria-live="polite">{mensajeDe(ruta)}</p>
                            </div>
                        );
                    })}
                </div>
                <p className={styles.fieldError} aria-live="polite">{mensajeDeGrupo('weightHistory', 'weightHistory.unit', 'weightHistory.unintentionalLoss')}</p>
                <div className={styles.chips} style={{ marginTop: '0.75rem' }}>
                    <button
                        type="button"
                        className={`${styles.chip} ${cp.weightHistory.unintentionalLoss ? styles.chipActive : ''}`}
                        onClick={() => setWh('unintentionalLoss', !cp.weightHistory.unintentionalLoss)}
                        aria-pressed={!!cp.weightHistory.unintentionalLoss}
                    >
                        {t('He perdido peso sin proponérmelo últimamente')}
                    </button>
                </div>
            </div>

            {/* --- Síntomas digestivos --- */}
            <div className={styles.field} role="group" aria-labelledby={id('gi')} aria-describedby={id('gi-pista')}>
                <span className={styles.label} id={id('gi')}>{t('Digestión')}</span>
                <p className={styles.hint} id={id('gi-pista')}>{t('Marca lo que te pasa con frecuencia — el menú se adapta.')}</p>
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
                <p className={styles.fieldError} aria-live="polite">{mensajeDeGrupo('giSymptoms')}</p>
            </div>

            {/* --- Entrenamiento --- */}
            <div className={styles.field} role="group" aria-labelledby={id('tr')} aria-describedby={id('tr-pista')}>
                <span className={styles.label} id={id('tr')}>{t('Entrenamiento')}</span>
                <p className={styles.hint} id={id('tr-pista')}>
                    {t('Con tipo y horario, la IA coloca los carbohidratos y la proteína alrededor de tu entreno.')}
                </p>
                <div className={styles.row}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                        <label className={styles.hint} htmlFor="tr-type" style={{ display: 'block', marginBottom: '0.25rem' }}>{t('Tipo')}</label>
                        <select id="tr-type" className={styles.select} value={cp.training.type} onChange={(e) => setTr('type', e.target.value)} aria-invalid={invalido('training.type') || undefined}>
                            {getTrainingTypes(t).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>
                    <div style={{ flex: 1, minWidth: 140 }}>
                        <label className={styles.hint} htmlFor="tr-time" style={{ display: 'block', marginBottom: '0.25rem' }}>{t('Horario habitual')}</label>
                        <select id="tr-time" className={styles.select} value={cp.training.timeOfDay} onChange={(e) => setTr('timeOfDay', e.target.value)} aria-invalid={invalido('training.timeOfDay') || undefined}>
                            {getTrainingTimes(t).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>
                    <div style={{ flex: 1, minWidth: 140 }}>
                        <label className={styles.hint} htmlFor="tr-days" style={{ display: 'block', marginBottom: '0.25rem' }}>{t('Días por semana')}</label>
                        <select id="tr-days" className={styles.select} value={String(cp.training.daysPerWeek || 0)} onChange={(e) => setTr('daysPerWeek', Number(e.target.value))} aria-invalid={invalido('training.daysPerWeek') || undefined}>
                            {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n === 0 ? '—' : n}</option>)}
                        </select>
                    </div>
                </div>
                <p className={styles.fieldError} aria-live="polite">{mensajeDeGrupo('training', 'training.type', 'training.timeOfDay', 'training.daysPerWeek')}</p>
            </div>

            {/* --- Texto libre --- */}
            <div className={styles.field}>
                <label className={styles.label} htmlFor="cp-free">{t('Algo más que deba saber la IA (clínico)')}</label>
                <p className={styles.hint} id={id('texto-pista')}>
                    {t('Cirugías, diagnósticos en estudio, indicaciones de tu médico… La IA extrae lo relevante.')}
                </p>
                <textarea
                    id="cp-free" className={styles.textarea}
                    rows={4} maxLength={MAX_FREETEXT}
                    placeholder={t('Ej. Me quitaron la vesícula en 2024; mi doctora me pidió bajar los triglicéridos…')}
                    value={cp.freeText}
                    onChange={(e) => { olvidarRechazo('freeText'); setCp((prev) => ({ ...prev, freeText: e.target.value })); }}
                    onBlur={() => volcar()}
                    aria-invalid={invalido('freeText') || undefined}
                    aria-describedby={`${id('texto-pista')} ${id('texto-contador')} ${id('err-texto')}`}
                />
                <div className={styles.counter} id={id('texto-contador')}>{(cp.freeText || '').length}/{MAX_FREETEXT}</div>
                <p id={id('err-texto')} className={styles.fieldError} aria-live="polite">{mensajeDe('freeText')}</p>
            </div>

        </div>
    );
}
