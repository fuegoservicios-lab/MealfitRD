import { safeLocalStorageGet, safeLocalStorageSet, safeLocalStorageRemove } from '../utils/safeLocalStorage';
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
    // [P1-MEDICATION-FREETEXT · 2026-06-19] Medicamentos = PII médica (misma clase que
    // medicalConditions/allergies, que ya son sensibles). Cifrar en mealfit_form_secure en vez
    // de plaintext en mealfit_form. `medications` (chips) cierra además un gap pre-existente de
    // nombres de fármacos en claro. Para invitados (sin sesión) quedan solo en memoria, igual
    // que el resto del paso médico — se pierden al recargar (costo aceptable, decisión P1-B7).
    'medications',
    'otherMedications',
    // [P1-CLINICAL-INTAKE · 2026-07-03] Intake clínico ampliado: cintura (dato
    // corporal, misma clase que bodyFat) + hábitos de consumo (alcohol/tabaco =
    // conducta de salud sensible; cafeína/agua entran por uniformidad del bloque —
    // más simple y privacy-safe tratar las 4 filas de QHabits igual). Para
    // invitados quedan en sessionStorage plano como el resto del bloque médico.
    'waistCm',
    'habitAlcohol',
    'habitSmoking',
    'habitCaffeine',
    'habitWater',
    // [P1-FORM-AUDIT-BATCH · 2026-07-03] (audit form · ALTA) El panel clínico opt-in
    // (ClinicalProfilePanel → updateData('clinical_profile', saved)) es la PII médica MÁS
    // densa del producto: labs (glucosa/HbA1c/LDL...), freeText de cirugías/diagnósticos,
    // historia ponderal, síntomas GI. NO estaba en esta lista → splitFormData la escribía
    // en claro en `mealfit_form` (localStorage) y SOBREVIVÍA al logout (resetApp solo borra
    // mealfit_form_secure). Regresión directa del modelo P1-B7. Cifrado + purge en load.
    'clinical_profile',
];

const PUBLIC_KEY = 'mealfit_form';
const SECURE_KEY = 'mealfit_form_secure';
const HKDF_SALT = 'mealfit-form-storage-v1';
const HKDF_INFO = 'mealfit-aes-gcm';

// [P1-GUEST-FORM-PERSIST · 2026-06-21] Un INVITADO no tiene sesión → no hay token para
// derivar la llave AES-GCM, así que los campos sensibles solo vivían en memoria y se
// perdían al recargar. Los guardamos en sessionStorage (NO localStorage): sobrevive un
// refresh/F5 dentro de la misma pestaña pero se BORRA al cerrar la pestaña → NUNCA queda
// PII médica plana persistente en disco (a diferencia de localStorage). El consumidor
// (AssessmentContext) hidrata SOLO cuando la auth resolvió a "sin sesión + modo invitado"
// (gate !loadingAuth) para no inyectar data de un invitado a un usuario que inicia sesión.
export const GUEST_SENSITIVE_KEY = 'mealfit_form_guest_sensitive';

// [P1-FORM-KEY · 2026-06-21] Llave ESTABLE para cifrar el form sensible. El backend
// (`auth.derive_form_key`) la deriva por usuario de un secreto del servidor y la
// devuelve en `/api/auth/session` y `/api/auth/me`; `firstPartySession.js` la setea
// aquí. Si está seteada, GANA sobre el `access_token` de Neon — que ROTABA (re-login
// / Brave borra la cookie) y por eso el form "se borraba". Vive SOLO en memoria del
// módulo (NO localStorage): un XSS no la encuentra persistida; se re-obtiene del
// backend en cada sesión. Si nunca se setea (backend viejo) → fallback al token =
// comportamiento anterior, cero regresión.
let _formSecret = null;

/** Setea la llave estable de cifrado del form. Devuelve true si cambió (para que
 *  el caller dispare una re-hidratación). null/corta la limpia (logout). */
export function setFormCryptoSecret(secret) {
    const next = (typeof secret === 'string' && secret.length >= 16) ? secret : null;
    if (next === _formSecret) return false;
    _formSecret = next;
    _invalidateAesKeyCache(); // [P2-FORM-SAVE-DEBOUNCE] el secret cambió → clave cacheada inválida
    return true;
}

/** Diagnóstico/tests: ¿hay llave estable activa? */
export function hasFormCryptoSecret() { return !!_formSecret; }

// [P1-FORM-HYDRATION-FACT · 2026-08-09] El HECHO de si el blob cifrado ya se leyó
// en esta vida de página. Sustituye a la DEDUCCIÓN por contenido que había antes
// (mirar si ciertos arrays venían vacíos), que no podía distinguir dos estados
// distintos: "la hidratación falló" y "el usuario todavía no ha llegado a ese
// paso del wizard". Al confundirlos, bloqueaba TODA escritura sensible durante
// los ~16 primeros pasos y el usuario perdía sus respuestas en cada refresco.
//
// Vive en memoria del módulo: nace `pending` en cada carga de página, que es
// exactamente la semántica que queremos (nada leído todavía).
//
//   pending  → aún no sabemos qué hay en el blob. NO escribir si el blob existe.
//   resolved → el blob se leyó (o no existía). Escribir es seguro.
//   failed   → el blob existe y NO se pudo descifrar. NO escribir: preservarlo.
let _hydrationState = 'pending';

/** Diagnóstico/tests: estado de la lectura del blob cifrado en esta página. */
export function getFormHydrationState() { return _hydrationState; }

/** Reset explícito (logout / tests). Vuelve al estado "nada leído todavía". */
export function resetFormHydrationState() { _hydrationState = 'pending'; }

/** Persiste los campos sensibles del INVITADO a sessionStorage. SALTA si todos están
 *  vacíos — el SAVE effect corre en mount ANTES de la hidratación con el formData inicial
 *  (sensibles vacíos); sin este guard sobreescribiría una copia poblada con vacíos. */
export function saveGuestSensitiveFields(formData) {
    try {
        if (!formData || typeof formData !== 'object') return;
        const sensitive = {};
        for (const k of SENSITIVE_FIELDS) {
            if (k in formData) sensitive[k] = formData[k];
        }
        const hasNonEmpty = Object.values(sensitive).some(v =>
            Array.isArray(v) ? v.length > 0 : (v !== '' && v != null)
        );
        if (!hasNonEmpty) return;
        sessionStorage.setItem(GUEST_SENSITIVE_KEY, JSON.stringify(sensitive));
    } catch { /* sessionStorage no disponible (modo privado) → no-op (comportamiento previo) */ }
}

/** Lee los campos sensibles del invitado desde sessionStorage (o null). */
export function loadGuestSensitiveFields() {
    try {
        const raw = sessionStorage.getItem(GUEST_SENSITIVE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return (parsed && typeof parsed === 'object') ? parsed : null;
    } catch { return null; }
}

/** Borra la copia plana del invitado. Llamar en TODO teardown de invitado/sesión. */
export function clearGuestSensitiveFields() {
    try { sessionStorage.removeItem(GUEST_SENSITIVE_KEY); } catch { /* noop */ }
}

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

// [P2-FORM-SAVE-DEBOUNCE · 2026-07-12] Cache de la CryptoKey derivada por secret. La
// derivación HKDF (importKey + deriveKey) se invocaba en CADA save (cada keystroke
// del wizard) y cada decrypt; como la clave es DETERMINISTA por secret, se cachea la
// última. Se invalida al cambiar el secret (setFormCryptoSecret) y en clearFormStorage.
let _cachedKey = null;
let _cachedKeyForSecret = null;
const _getAesKey = async (secret) => {
    if (_cachedKey && _cachedKeyForSecret === secret) return _cachedKey;
    const k = await deriveAesKey(secret);
    _cachedKey = k;
    _cachedKeyForSecret = secret;
    return k;
};
const _invalidateAesKeyCache = () => { _cachedKey = null; _cachedKeyForSecret = null; };

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
    // [P2-LOCALSTORAGE-SSOT · 2026-08-19] `onError` en vez de try/catch propio: es
    // el mismo aviso, por el envoltorio unico. Sin el, un fallo de cuota dejaria
    // de registrarse y el formulario se perderia en silencio.
    safeLocalStorageSet(PUBLIC_KEY, JSON.stringify(publicData), {
        onError: (e) => console.warn('[secureFormStorage] No se pudo guardar mealfit_form:', e),
    });

    // [P1-FORM-KEY · 2026-06-21] Cifrar con la llave estable si está disponible;
    // si no, fallback al access_token (comportamiento anterior / pre-migración).
    const secret = _formSecret || session?.access_token;
    const hasAuthAndCrypto = !!secret && isCryptoAvailable();

    if (hasAuthAndCrypto) {
        // [FORM-DATA-PRESERVE · 2026-06-21 · reescrito P1-FORM-HYDRATION-FACT 2026-08-09]
        // Anti-clobber. El peligro real: esta escritura REEMPLAZA el blob entero, así
        // que hacerla con un estado a medio hidratar destruye lo que no esté en él.
        //
        // La versión anterior detectaba ese peligro DEDUCIÉNDOLO del contenido —
        // ciertos arrays vacíos ⇒ "el descifrado falló". Pero vacío también es el
        // estado legítimo de quien aún no ha contestado ese paso, y de quien no tiene
        // nada que declarar. Al no poder distinguirlos, bloqueaba toda escritura
        // sensible durante casi todo el wizard: el usuario contestaba, refrescaba y
        // sus respuestas no estaban, una y otra vez.
        //
        // Ahora se decide por el HECHO de si el blob se leyó (`_hydrationState`),
        // que sí distingue "falló" de "todavía no". Efecto secundario buscado: con
        // la hidratación resuelta el reemplazo total vuelve a ser correcto, así que
        // BORRAR una alergia vuelve a persistirse — un merge no lo permitiría.
        let _blobExists = false;
        _blobExists = !!safeLocalStorageGet(SECURE_KEY, null);

        // Si NO hay blob no hay nada que destruir: escribir es siempre seguro.
        // Si LO HAY, solo escribimos cuando consta que ya lo leímos en esta página.
        if (_blobExists && _hydrationState !== 'resolved') {
            // public ya se guardó arriba; NO tocamos el secure blob.
            return;
        }

        // No estrenar el blob con un objeto íntegramente vacío: el save effect
        // corre en mount con el formData inicial, y un blob vacío recién nacido
        // no aporta nada. Misma polaridad que la defensa del invitado.
        if (!_blobExists) {
            const _hasContent = Object.values(sensitiveData).some((v) =>
                Array.isArray(v) ? v.length > 0 : (v !== '' && v != null)
            );
            if (!_hasContent) return;
        }

        try {
            const key = await _getAesKey(secret);
            const ciphertext = await encryptObject(sensitiveData, key);
            // [P2-LOCALSTORAGE-SSOT · 2026-08-19] El envoltorio devuelve `false` en vez
            // de lanzar, y este `catch` —que cubre ademas el cifrado— es quien decide
            // NO borrar el blob previo. Se relanza para que siga habiendo UN solo
            // manejador y la decision de arriba se siga tomando.
            if (!safeLocalStorageSet(SECURE_KEY, ciphertext)) {
                throw new Error('localStorage rechazo el blob cifrado (cuota o modo privado)');
            }
        } catch (e) {
            console.warn('[secureFormStorage] Encrypt falló — sensitive no persistido:', e);
            // NO borramos el blob previo: el cifrado es la ÚLTIMA sentencia del try,
            // así que si algo lanzó antes, lo que hay guardado sigue siendo legible.
            // Borrarlo convertía un fallo transitorio de cifrado en pérdida definitiva.
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
        const raw = safeLocalStorageGet(PUBLIC_KEY, null);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                publicData = parsed;
                // [P1-FORM-AUDIT-BATCH · 2026-07-03] (audit form · ALTA) Purge defensivo:
                // si una key HOY-sensible quedó en el blob público (escrita por una versión
                // anterior — caso real: `clinical_profile` en claro antes de entrar a
                // SENSITIVE_FIELDS), se elimina del blob Y se re-escribe el storage saneado.
                // Sin esto, la PII médica plana de sesiones viejas sobreviviría para siempre
                // (incluido post-logout, que solo borra mealfit_form_secure).
                let _purged = false;
                for (const _sk of SENSITIVE_FIELDS) {
                    if (_sk in publicData) {
                        delete publicData[_sk];
                        _purged = true;
                    }
                }
                if (_purged) {
                    safeLocalStorageSet(PUBLIC_KEY, JSON.stringify(publicData));
                }
            }
        }
    } catch (e) {
        console.warn('[secureFormStorage] mealfit_form corrupto, ignorando:', e);
    }

    // [P1-FORM-KEY · 2026-06-21] Descifrado con DOBLE llave: primero la llave estable
    // (`_formSecret`, sobrevive re-logins / Brave); si falla, fallback al access_token
    // de Neon → esto MIGRA los blobs viejos que se cifraron con el token (se re-guardan
    // bajo la llave estable en el próximo save). En first-party el token es null → solo
    // se intenta la llave estable.
    const candidates = [];
    if (_formSecret) candidates.push(_formSecret);
    const accessToken = session?.access_token;
    if (accessToken && accessToken !== _formSecret) candidates.push(accessToken);

    // [P1-FORM-HYDRATION-FACT · 2026-08-09] Esta función es la ÚNICA que sabe si el
    // blob se pudo leer, así que es la que deja constancia. `saveFormData` decide a
    // partir de ese hecho, no adivinando por el contenido.
    let _blob = null;
    _blob = safeLocalStorageGet(SECURE_KEY, null);

    if (!_blob) {
        // Nada guardado todavía: la lectura queda resuelta y escribir no puede
        // destruir nada. Es el caso del usuario nuevo.
        _hydrationState = 'resolved';
    } else if (candidates.length && isCryptoAvailable()) {
        let _opened = false;
        for (const secret of candidates) {
            try {
                const key = await _getAesKey(secret);
                const decrypted = await decryptObject(_blob, key);
                if (decrypted && typeof decrypted === 'object') {
                    sensitiveData = decrypted;
                    _opened = true;
                    break;
                }
            } catch { /* llave incorrecta: probamos la siguiente */ }
        }
        // El try/catch va DENTRO del bucle a propósito: envolviendo el bucle, un
        // fallo de la llave estable abortaba el intento con el access_token y la
        // migración de los blobs viejos no llegaba a ocurrir nunca.
        _hydrationState = _opened ? 'resolved' : 'failed';
        if (!_opened) {
            console.warn('[secureFormStorage] Decrypt falló con todas las llaves — se preserva el blob');
        }
    } else {
        // Hay blob pero aún no tenemos con qué abrirlo (la llave estable todavía
        // no ha llegado del backend). NO es un fallo: es un "todavía no".
        _hydrationState = 'pending';
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
        raw = safeLocalStorageGet(PUBLIC_KEY, null);
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
    safeLocalStorageSet(PUBLIC_KEY, JSON.stringify(publicData), {
        onError: (e) => console.warn('[secureFormStorage] migrate: no se pudo reescribir mealfit_form:', e),
    });
    return { publicData, sensitiveData };
};

/**
 * Borra ambas claves del storage. Llamado durante logout / resetApp.
 */
export const clearFormStorage = () => {
    safeLocalStorageRemove(PUBLIC_KEY);
    safeLocalStorageRemove(SECURE_KEY);
    _invalidateAesKeyCache(); // [P2-FORM-SAVE-DEBOUNCE] no retener la clave tras limpiar
    // Ya no hay blob: la lectura queda trivialmente resuelta y el próximo usuario
    // de esta pestaña puede escribir desde cero sin quedar bloqueado por el estado
    // que dejó el anterior.
    _hydrationState = 'resolved';
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
//    El spread los enviaría como `[]`/`""` y `el UPDATE del cliente anterior` REEMPLAZA
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
    // [P1-FORM-HYDRATION-FACT · 2026-08-09] Gate por IDENTIDAD de sesión, no por
    // presencia de Bearer: la sesión first-party se publica con el access_token
    // anulado a propósito, así que exigirlo dejaba este guard inerte precisamente
    // para quienes entran por código de un solo uso, OAuth o PWA en iOS — es decir,
    // para quienes más lo necesitaban.
    if (!session?.user?.id && !session?.access_token) return false;
    if (typeof localStorage === 'undefined') return false;
    let hasSecureBlob = false;
    try {
        hasSecureBlob = !!safeLocalStorageGet(SECURE_KEY, null);
    } catch {
        return false;
    }
    if (!hasSecureBlob) return false;
    // Si consta que el blob YA se leyó, lo que hay en formData es real —incluido
    // un array vacío que el usuario dejó vacío a propósito— y bloquear sería negarle
    // guardar su propio perfil. El hecho manda sobre la deducción por contenido.
    if (_hydrationState === 'resolved') return false;
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
 * @param {{access_token?: string}|null|undefined} [session] — sesión de auth.
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
