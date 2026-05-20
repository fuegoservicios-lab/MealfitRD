// [P1-B7] Storage seguro para datos sensibles del formulario.
//
// Antes, `mealfit_form` en localStorage contenía TODO el formData en plaintext
// — incluyendo allergies, medicalConditions, dislikes, struggles, motivation,
// bodyFat, otherAllergies, otherConditions, otherDislikes, otherStruggles.
// Cualquier XSS o extensión maliciosa leía el perfil médico completo.
// Compliance issue en jurisdicciones con HIPAA/LGPD/análogos.
//
// Ahora:
//   - **Auth**: campos no-sensibles en `mealfit_form` (plain, compat). Sensibles
//     cifrados AES-GCM en `mealfit_form_secure` con clave HKDF derivada del
//     `access_token` de la sesión. Cuando el usuario cierra sesión o el token
//     rota, los datos cifrados quedan inaccesibles (degradación segura).
//   - **Guest**: solo campos no-sensibles en `mealfit_form`. Sensibles SOLO en
//     memoria (state de React); se pierden al recargar — costo aceptable para
//     usuarios no autenticados.
//   - **Migración legacy**: el primer load detecta el formato viejo (sensitive
//     mezclado en `mealfit_form`), separa, persiste cifrado (si auth) y
//     reescribe `mealfit_form` solo con public.
//
// Si el browser no soporta `crypto.subtle` (entornos legacy / SSR), el storage
// degrada a "no persistir sensitive" — preferimos perder persistencia sobre
// guardar plain.

// Campos considerados sensibles. Cualquier dato médico o texto libre largo que
// pueda contener PII personal cae aquí.
export const SENSITIVE_FIELDS = [
    'allergies',
    'medicalConditions',
    'dislikes',
    'struggles',
    'otherAllergies',
    'otherConditions',
    'otherDislikes',
    'otherStruggles',
    'motivation',
    'bodyFat',
];

const PUBLIC_KEY = 'mealfit_form';
const SECURE_KEY = 'mealfit_form_secure';
const HKDF_SALT = 'mealfit-form-storage-v1';
const HKDF_INFO = 'mealfit-aes-gcm';

// ============================================================
// Split / merge helpers
// ============================================================

/**
 * Devuelve `{publicData, sensitiveData}` separando `formData` por la lista
 * `SENSITIVE_FIELDS`. Defensivo: `formData` no-objeto retorna ambos vacíos.
 */
export const splitFormData = (formData) => {
    if (!formData || typeof formData !== 'object') {
        return { publicData: {}, sensitiveData: {} };
    }
    const publicData = {};
    const sensitiveData = {};
    for (const [k, v] of Object.entries(formData)) {
        if (SENSITIVE_FIELDS.includes(k)) {
            sensitiveData[k] = v;
        } else {
            publicData[k] = v;
        }
    }
    return { publicData, sensitiveData };
};

/**
 * Merge public + sensitive de vuelta en un único formData. Sensitive sobrescribe
 * public si hay colisión (no debería ocurrir si splitFormData se usó).
 */
export const mergeFormData = (publicData = {}, sensitiveData = {}) => ({
    ...publicData,
    ...sensitiveData,
});

// ============================================================
// AES-GCM helpers (Web Crypto)
// ============================================================

const isCryptoAvailable = () => (
    typeof crypto !== 'undefined' &&
    !!crypto.subtle &&
    typeof crypto.subtle.importKey === 'function'
);

const _enc = new TextEncoder();
const _dec = new TextDecoder();

/**
 * Deriva una clave AES-GCM 256-bit del `secret` vía HKDF-SHA256. La clave es
 * determinística para el mismo secret + salt + info, así que cada hidratación
 * con el mismo access_token reproduce la misma clave (necesario para descifrar).
 */
const deriveAesKey = async (secret) => {
    const baseKey = await crypto.subtle.importKey(
        'raw',
        _enc.encode(secret),
        { name: 'HKDF' },
        false,
        ['deriveKey']
    );
    return await crypto.subtle.deriveKey(
        {
            name: 'HKDF',
            hash: 'SHA-256',
            salt: _enc.encode(HKDF_SALT),
            info: _enc.encode(HKDF_INFO),
        },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
};

/**
 * Cifra `obj` (JSON-serializable) y devuelve base64 string `iv(12) || ciphertext`.
 */
const encryptObject = async (obj, key) => {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = _enc.encode(JSON.stringify(obj));
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        plaintext
    );
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);
    // btoa requiere string; convertimos byte-by-byte.
    let bin = '';
    for (let i = 0; i < combined.length; i++) bin += String.fromCharCode(combined[i]);
    return btoa(bin);
};

/**
 * Descifra el blob base64 (`iv || ciphertext`). Devuelve el objeto JSON o null
 * si falla (clave inválida, blob corrupto, formato incompatible).
 */
const decryptObject = async (b64, key) => {
    try {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        if (bytes.length < 13) return null;
        const iv = bytes.slice(0, 12);
        const ciphertext = bytes.slice(12);
        const plaintext = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            ciphertext
        );
        return JSON.parse(_dec.decode(plaintext));
    } catch (e) {
        // Token rotó, blob corrupto o clave incorrecta — descartar silenciosamente.
        // El caller decide si caer al fallback de "sensitive en memoria".
        return null;
    }
};

// ============================================================
// Public API: load / save formData con seguridad por capas
// ============================================================

/**
 * Persiste el formData. Reglas:
 *   - Public siempre va plain en `mealfit_form` (compat con código legacy).
 *   - Sensitive cifrado en `mealfit_form_secure` si hay session válida.
 *   - Sensitive descartado del storage si NO hay session (guest) — solo en memoria.
 *
 * No-op si `formData` es falsy. No lanza: errores se loguean a consola y la
 * UI continúa con lo que pueda persistir.
 */
export const saveFormData = async (formData, session) => {
    if (!formData || typeof formData !== 'object') return;
    const { publicData, sensitiveData } = splitFormData(formData);

    // Public siempre en plain — campos como `age`, `gender`, `mainGoal` no son
    // PII médica y los leemos sync en el initial state del provider.
    try {
        localStorage.setItem(PUBLIC_KEY, JSON.stringify(publicData));
    } catch (e) {
        console.warn('[secureFormStorage] No se pudo guardar mealfit_form:', e);
    }

    const accessToken = session?.access_token;
    const hasAuthAndCrypto = !!accessToken && isCryptoAvailable();

    if (hasAuthAndCrypto) {
        try {
            const key = await deriveAesKey(accessToken);
            const ciphertext = await encryptObject(sensitiveData, key);
            localStorage.setItem(SECURE_KEY, ciphertext);
        } catch (e) {
            console.warn('[secureFormStorage] Encrypt falló — sensitive no persistido:', e);
            // Borrar el secure storage para no dejar un blob ilegible que
            // confunda al próximo load.
            try { localStorage.removeItem(SECURE_KEY); } catch { /* noop */ }
        }
    }
    // Sin session: NO tocamos `mealfit_form_secure`. Antes borrábamos aquí, pero
    // al refrescar la página hay una ventana de 50-200ms donde el provider monta
    // con `session=null` (auth aún no hidratada) y este effect dispara con
    // sensitive vacío + session null → la rama "guest" borraba el blob cifrado
    // ANTES de que el effect de hidratación pudiera leerlo, perdiendo todos los
    // campos sensibles (allergies, medicalConditions, dislikes, motivation, etc.).
    // El borrado al logout está cubierto explícitamente por `clearFormStorage()`
    // y los `localStorage.removeItem(SECURE_KEY)` en AssessmentContext (handlers
    // de signOut). No necesitamos borrar acá.
};

/**
 * Carga el formData. Devuelve `{publicData, sensitiveData}` con shapes vacíos
 * si nada está disponible.
 *
 * - Public: lee `mealfit_form` (sync, vía localStorage).
 * - Sensitive: si hay session, descifra `mealfit_form_secure` (async). Sin
 *   session, devuelve `{}` — el caller debe usar `initialFormData` para los
 *   campos sensibles.
 */
export const loadFormData = async (session) => {
    let publicData = {};
    let sensitiveData = {};

    try {
        const raw = localStorage.getItem(PUBLIC_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                publicData = parsed;
            }
        }
    } catch (e) {
        console.warn('[secureFormStorage] mealfit_form corrupto, ignorando:', e);
    }

    const accessToken = session?.access_token;
    if (accessToken && isCryptoAvailable()) {
        try {
            const blob = localStorage.getItem(SECURE_KEY);
            if (blob) {
                const key = await deriveAesKey(accessToken);
                const decrypted = await decryptObject(blob, key);
                if (decrypted && typeof decrypted === 'object') {
                    sensitiveData = decrypted;
                }
            }
        } catch (e) {
            console.warn('[secureFormStorage] Decrypt falló — sensitive vacío:', e);
        }
    }

    return { publicData, sensitiveData };
};

/**
 * Migración del formato legacy. Detecta si `mealfit_form` contiene CUALQUIER
 * campo sensible mezclado con el public; si sí, los extrae a memoria (devolviendo
 * el sensitive como result) y reescribe `mealfit_form` solo con public.
 *
 * IMPORTANTE: el sensitive extraído NO se persiste cifrado por esta función —
 * el caller decide cuándo persistir vía `saveFormData` (cuando tenga session).
 *
 * Idempotente: si `mealfit_form` ya está limpio, no-op. Devuelve `null` si no
 * hay nada que migrar, o `{publicData, sensitiveData}` con la separación.
 */
export const migrateLegacyFormStorage = () => {
    let raw;
    try {
        raw = localStorage.getItem(PUBLIC_KEY);
    } catch {
        return null;
    }
    if (!raw) return null;

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!parsed || typeof parsed !== 'object') return null;

    const hasSensitive = SENSITIVE_FIELDS.some(f => f in parsed);
    if (!hasSensitive) return null;  // ya migrado / nada que hacer

    const { publicData, sensitiveData } = splitFormData(parsed);
    try {
        localStorage.setItem(PUBLIC_KEY, JSON.stringify(publicData));
    } catch (e) {
        console.warn('[secureFormStorage] migrate: no se pudo reescribir mealfit_form:', e);
    }
    return { publicData, sensitiveData };
};

/**
 * Borra ambas claves del storage. Llamado durante logout / resetApp.
 */
export const clearFormStorage = () => {
    try { localStorage.removeItem(PUBLIC_KEY); } catch { /* noop */ }
    try { localStorage.removeItem(SECURE_KEY); } catch { /* noop */ }
};

// ============================================================
// [P1-FORM-9] Helper de payload para `updateUserProfile({health_profile: ...})`
// ------------------------------------------------------------
// ANTES, Dashboard.jsx (×4) y Settings.jsx (×2) hacían:
//
//     updateUserProfile({ health_profile: { ...formData, householdSize: num } })
//
// Dos problemas con ese patrón:
//
// 1. **Filtrado de flags internos**: el spread incluye `_weightUnitTouched`,
//    `_householdSizeTouched`, etc. (flags frontend-only del touched-tracking).
//    El backend `_strip_untrusted_internal_keys` los limpia al re-leer, pero
//    quedan persistidos en la columna JSONB. Ruido en DB + costo de bytes.
//
// 2. **Race con hidratación cifrada**: si el usuario abre Dashboard ANTES de
//    que termine `secureLoadFormData` (~50-200ms post-login), `formData`
//    aún no tiene los campos sensibles (`medicalConditions`, `allergies`,
//    `motivation`, `dislikes`, etc.) hidratados desde `mealfit_form_secure`.
//    El spread los enviaría como `[]`/`""` y `supabase.update()` REEMPLAZA
//    la columna entera, BORRANDO datos médicos previos.
//
// El helper:
//   - Filtra TODA key con prefijo `_` (espejo exacto del strip backend
//     `routers/plans.py: _strip_untrusted_internal_keys` modo estricto).
//   - Detecta race de hidratación pendiente: si hay session activa Y
//     `mealfit_form_secure` existe en localStorage Y al menos un required
//     sensitive array (`allergies`/`medicalConditions`) viene vacío,
//     asume que la decodificación está in-flight y retorna `null`.
//     `ProtectedRoute` ya garantiza que solo usuarios con `health_profile`
//     completo lleguen a Dashboard, así que un array vacío en ese contexto
//     es señal fuerte de race (no de "usuario sin alergias" — ese caso
//     produce `["Ninguna"]` por el sentinel exclusivo del wizard).
//
// Caller responsabilidad: si retorna `null`, mostrar feedback al usuario
// y NO disparar el update. Comportamiento sugerido:
//
//     const payload = buildHealthProfilePayload(formData, { householdSize }, session);
//     if (!payload) {
//         toast.warning('Tu perfil aún se está cargando. Inténtalo en un momento.');
//         return;
//     }
//     updateUserProfile({ health_profile: payload });
//
// El backend tiene defensa adicional vía RPC `update_health_profile_merge`
// (P1-FORM-9 SQL migration) que aplica JSONB `||` operator en lugar de
// reemplazo total — pero ese path está OPT-IN. El helper acá es la primera
// línea de defensa.
// ============================================================

/**
 * [P1-FORM-9] Lista de campos requeridos por backend cuya AUSENCIA en
 * Dashboard indica race de hidratación (no "usuario sin datos").
 *
 * Espejo de `_REQUIRED_FORM_FIELDS` en `backend/routers/plans.py` filtrado
 * a los safety-critical arrays (`allergies`, `medicalConditions`). Si uno
 * de estos viene `[]` mientras la session está activa Y el blob secure
 * existe, asumimos race — los demás required (gender, age, etc.) son
 * public no-secure, no participan del race.
 */
const _REQUIRED_SENSITIVE_ARRAYS = ['allergies', 'medicalConditions'];

/**
 * [P1-FORM-9] Detecta si la decodificación del blob cifrado está en vuelo.
 * Retorna `true` solo si hay evidencia FUERTE de race; conservador para no
 * bloquear updates legítimos.
 *
 * Reglas (todas deben darse para retornar true):
 *   - Hay session activa (no guest).
 *   - `mealfit_form_secure` existe en localStorage (hubo persistencia previa).
 *   - Al menos un required sensitive array está vacío.
 *
 * Si no hay blob, asumimos primera sesión / usuario nuevo / blob purgado —
 * no hay race posible y dejamos pasar el update.
 *
 * @param {object} formData
 * @param {{access_token?: string}|null|undefined} session
 * @returns {boolean}
 */
const _isHydrationLikelyPending = (formData, session) => {
    if (!session?.access_token) return false;
    if (typeof localStorage === 'undefined') return false;
    let hasSecureBlob = false;
    try {
        hasSecureBlob = !!localStorage.getItem(SECURE_KEY);
    } catch {
        return false;
    }
    if (!hasSecureBlob) return false;
    if (!formData || typeof formData !== 'object') return true;
    return _REQUIRED_SENSITIVE_ARRAYS.some((field) => {
        const v = formData[field];
        return Array.isArray(v) && v.length === 0;
    });
};

/**
 * [P1-FORM-9] Construye el payload `health_profile` para `updateUserProfile`,
 * filtrando flags internos `_*` y opcionalmente bloqueando si la hidratación
 * cifrada parece estar en curso.
 *
 * @param {object} formData — state actual del wizard.
 * @param {object} [overrides] — campos a sobrescribir/añadir (ej. `{householdSize: 4}`).
 * @param {{access_token?: string}|null|undefined} [session] — sesión Supabase.
 *   Si se omite, el gate de hidratación se desactiva (no hay forma de detectar race).
 * @returns {object|null} payload listo para `health_profile`, o `null` si
 *   detectamos race de hidratación (caller debe abortar + dar feedback).
 */
// [P3-PROFILE-NUMERIC-COERCE · 2026-05-20] Campos del health_profile que
// son semánticamente numéricos. El wizard `InteractiveQuestions` los
// guarda en formData como strings (`e.target.value` es string) y, sin
// coerce, terminaban en el JSONB como strings (`{"weight": "70"}` en
// lugar de `{"weight": 70}`). Todos los lectores hacen coerción al
// reinterpretar, así que era cosmetic — pero la inspección/queries en
// DB (e.g. `WHERE health_profile->'weight' > 80`) requería casts manuales.
// Coerce aquí (capa de persistencia) garantiza que toda escritura nueva
// produce JSON-numbers. Migración SSOT [`p3_profile_numeric_coerce_2026_05_20.sql`]
// normaliza las filas legacy.
const NUMERIC_HEALTH_FIELDS = ['weight', 'height', 'age', 'bodyFat'];

const _coerceNumericHealthFields = (payload) => {
    if (!payload || typeof payload !== 'object') return payload;
    for (const field of NUMERIC_HEALTH_FIELDS) {
        const v = payload[field];
        // Solo coerce strings con contenido (no '' ni null ni ya-number).
        if (typeof v === 'string' && v.trim() !== '') {
            const n = parseFloat(v);
            // Validamos isFinite para rechazar 'NaN', 'Infinity', '12abc' →
            // dejamos el string como está (el backend re-validará o fallará).
            if (Number.isFinite(n)) {
                payload[field] = n;
            }
        }
    }
    return payload;
};

export const buildHealthProfilePayload = (formData, overrides = {}, session = null) => {
    if (_isHydrationLikelyPending(formData, session)) {
        // Caller decide cómo notificar — devolvemos null para fallar explícito.
        return null;
    }
    const merged = { ...stripInternalFlags(formData), ...(overrides || {}) };
    return _coerceNumericHealthFields(merged);
};


/**
 * [P1-8] Filtra cualquier key con prefijo `_` del objeto formData.
 *
 * Usado por `buildHealthProfilePayload` (persistencia DB) y por
 * `Plan.jsx → generateAIPlanStream` (payload al backend `/api/plans/analyze/stream`).
 * Antes el spread `{ ...formData, ... }` enviaba claves internas como
 * `_weightUnitTouched`/`_householdSizeTouched` al endpoint y, transitivamente,
 * al prompt del LLM (que dumpea `form_data` como contexto). Drift de
 * contrato + leak menor de estado UI al modelo. El helper centraliza el
 * filtro en un único lugar para que el invariante sea testeable y el
 * patrón sea reutilizable por nuevos call sites.
 *
 * @param {object|null|undefined} formData — state del wizard (o subset).
 * @returns {object} copia con solo las keys que NO empiezan con `_`.
 */
export const stripInternalFlags = (formData) => {
    const safe = {};
    if (formData && typeof formData === 'object') {
        for (const [k, v] of Object.entries(formData)) {
            // Mismo invariante que el backend: TODA key con prefijo `_` se
            // considera flag interno y NO se persiste/transmite a sistemas
            // downstream.
            if (typeof k === 'string' && k.startsWith('_')) continue;
            safe[k] = v;
        }
    }
    return safe;
};
