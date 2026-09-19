// [P1-PLAN-LOTE-108 · 2026-09-19] Actualizaciones en vivo (OTA) de la app nativa.
//
// EL PROBLEMA. El binario de iOS lleva la web EMPAQUETADA (`webDir: 'dist'`, sin
// `server`): un arreglo desplegado en la web no llega al iPhone hasta un build manual de
// Codemagic + el procesado de Apple (y, ya en la App Store, su revisión de 1-2 días).
//
// LO QUE HACE ESTO. En cada despliegue del frontend, el VPS construye además el paquete
// nativo (`scripts/build-ota-bundle.mjs`) y lo publica en `/ota/` junto a un manifiesto.
// La app, al abrirse, lee ese manifiesto, descarga el zip si es POSTERIOR al que corre y
// lo deja preparado; se aplica en el SIGUIENTE arranque en frío. Apple lo permite para
// HTML/CSS/JS mientras no cambie el propósito de la app.
//
// CUATRO DECISIONES que no son obvias:
//  1. NO se recarga en caliente (`LiveUpdate.reload()`). El propio plugin documenta que
//     un recurso web con candado (IndexedDB) puede dejar la pantalla en blanco hasta
//     forzar el cierre, y eso no se puede medir sin un iPhone delante. Arranque en frío.
//  2. `ready()` se llama cuando la app PINTÓ (`mealfit:app-ready`), no al evaluar el
//     módulo: un paquete que revienta al renderizar no debe darse por bueno. Si no
//     llega en `readyTimeout` (10 s, capacitor.config.ts) el plugin vuelve solo al
//     paquete del binario. Un paquete que provocó esa vuelta atrás no se reintenta.
//  3. Un paquete web que necesita un plugin nativo NUEVO rompería los binarios viejos:
//     el manifiesto lleva `minNativeBuild` y la app lo compara con SU build number.
//     `ota.config.json` es el SSOT y un test obliga a subirlo al tocar las deps nativas.
//  4. La URL del zip se valida ESTRICTA contra nuestro host: el manifiesto no puede
//     mandar a la app a descargar código de otro sitio.
//
// En la web (PWA) nada de esto corre: el gate es `isNativeApp()` y el plugin se importa
// dinámico para no viajar en el bundle web.
// tooltip-anchor: iniciarOtaNativa, decidirOta (test_p1_plan_lote_108.py, lote108.test.js)

import { isNativeApp, nativeHttpGet } from '../config/platform';
import { captureException } from '../utils/observability';
import { safeLocalStorageGet, safeLocalStorageSet } from '../utils/safeLocalStorage';
import { toast } from 'sonner';
import { t } from '../i18n';

export const OTA_BASE_URL = 'https://app.bioboros.com/ota/';
export const OTA_MANIFEST_URL = `${OTA_BASE_URL}latest.json`;
const ID_RE = /^\d{8}-\d{6}$/;
const SHA_RE = /^[0-9a-f]{64}$/;
const CLAVE_BLOQUEADOS = 'mf_ota_bloqueados';
// [P1-PLAN-LOTE-113 · 2026-09-19] Era 1 HORA, y eso rompía el uso real. La revisión corre al arrancar en frío y al
// VOLVER a la app si pasó este tiempo desde la última. Con una hora, quien volvía a la app a los 50 minutos de un
// despliegue no revisaba nada: cerraba del todo, abría (ahí SÍ revisa y descarga, pero ya corre el paquete viejo),
// probaba… y veía lo de antes. El dueño lo vivió tres veces seguidas («sigue igual» al teclado, a las metas, y un
// `/sonda` que llegó al servidor como mensaje normal: la prueba de que corría un paquete sin ese código).
// La revisión cuesta un GET de ~300 bytes: un minuto de calma basta para no repetirla en ráfagas.
const REVISAR_CADA_MS = 60 * 1000;
const CLAVE_AVISADO = 'mf_ota_avisado';
const CLAVE_VISTO = 'mf_ota_visto';

// [P1-PLAN-LOTE-113] El paquete se aplica en el siguiente arranque EN FRÍO y nadie lo sabía: en iOS casi nadie
// cierra las apps del todo, así que una actualización descargada podía tardar días en verse. Se dice UNA vez por
// paquete, sin botón: la recarga en caliente sigue descartada (decisión 1 de arriba).
function avisarPreparado(bundleId) {
    if (safeLocalStorageGet(CLAVE_AVISADO, null) === bundleId) return;
    safeLocalStorageSet(CLAVE_AVISADO, bundleId);
    try {
        toast(t('Actualización lista'), {
            description: t('Cierra la app del todo y vuelve a abrirla para aplicarla.'),
            duration: 6000,
        });
    } catch { /* best-effort */ }
}

// Y al revés: la primera vez que corre un paquete nuevo se confirma, para no tener que adivinar si ya se aplicó.
async function avisarSiSeActualizo(LiveUpdate) {
    const propio = otaOwnId();
    const visto = safeLocalStorageGet(CLAVE_VISTO, null);
    if (visto === propio) return;
    safeLocalStorageSet(CLAVE_VISTO, propio);
    let esOta = false;
    try { esOta = Boolean((await LiveUpdate.getCurrentBundle())?.bundleId); } catch { /* sin dato: no se avisa */ }
    // Primera ejecución tras instalar el binario: no hay nada que celebrar. Un paquete OTA sí es una actualización.
    if (!visto && !esOta) return;
    try { toast.success(t('App actualizada'), { duration: 4000 }); } catch { /* best-effort */ }
}

export function otaOwnId() {
    try {
        return typeof __OTA_BUNDLE_ID__ === 'string' ? __OTA_BUNDLE_ID__ : '';
    } catch {
        return '';
    }
}

/**
 * Decisión PURA: qué hacer con un manifiesto. Devuelve `{ accion, motivo }` con
 * `accion` ∈ 'nada' | 'descargar' | 'reset'.
 */
export function decidirOta({ manifest, ownId, versionCode, currentBundleId = null, nextBundleId = null, bloqueados = [] }) {
    const nada = (motivo) => ({ accion: 'nada', motivo });
    if (!manifest || typeof manifest !== 'object' || manifest.schema !== 1) return nada('manifiesto_invalido');
    // Botón del pánico: volver al paquete del binario. Solo si hay algo que deshacer.
    if (manifest.reset === true) return currentBundleId ? { accion: 'reset', motivo: 'reset_pedido' } : nada('reset_sin_paquete');
    if (manifest.enabled !== true) return nada('apagado');
    const { bundleId, url, checksum, minNativeBuild } = manifest;
    if (typeof bundleId !== 'string' || !ID_RE.test(bundleId)) return nada('id_invalido');
    if (url !== `${OTA_BASE_URL}${bundleId}.zip`) return nada('url_ajena');
    if (typeof checksum !== 'string' || !SHA_RE.test(checksum)) return nada('checksum_invalido');
    if (!Number.isInteger(minNativeBuild) || minNativeBuild < 1) return nada('min_build_invalido');
    const build = Number.parseInt(versionCode, 10);
    if (!Number.isInteger(build)) return nada('build_desconocido');
    if (build < minNativeBuild) return nada('binario_antiguo');
    if (!ID_RE.test(ownId || '')) return nada('sin_id_propio');
    if (bundleId <= ownId) return nada('al_dia');
    if (bloqueados.includes(bundleId)) return nada('bloqueado');
    if (nextBundleId === bundleId) return nada('ya_preparado');
    return { accion: 'descargar', motivo: 'paquete_nuevo' };
}

function leerBloqueados() {
    try {
        const raw = safeLocalStorageGet(CLAVE_BLOQUEADOS, null);
        const lista = raw ? JSON.parse(raw) : [];
        return Array.isArray(lista) ? lista.filter((x) => typeof x === 'string') : [];
    } catch {
        return [];
    }
}

function bloquear(bundleId) {
    if (!bundleId) return;
    const lista = leerBloqueados().filter((x) => x !== bundleId);
    lista.push(bundleId);
    safeLocalStorageSet(CLAVE_BLOQUEADOS, JSON.stringify(lista.slice(-20)));
}

function avisar(err, action, extra) {
    try {
        captureException(err, { tags: { component: 'liveUpdate', action }, extra });
    } catch { /* best-effort */ }
}

async function leerManifiesto() {
    // Petición NATIVA: desde `capacitor://localhost` un fetch a nuestro nginx sería
    // cross-origin y los estáticos no mandan CORS. `nativeHttpGet` no pasa por el WebView.
    const res = await nativeHttpGet({
        url: OTA_MANIFEST_URL,
        params: { t: String(Date.now()) },
        headers: { 'Cache-Control': 'no-cache' },
        connectTimeout: 8000,
        readTimeout: 8000,
    });
    if (!res || res.status !== 200) return null;
    if (typeof res.data !== 'string') return res.data;
    // Sin `/ota/` publicado, el host de la app contesta 200 con el index.html del SPA:
    // eso es «no hay manifiesto», no un error que merezca Sentry.
    try { return JSON.parse(res.data); } catch { return null; }
}

let _revisando = false;
let _ultimaRevision = 0;

export async function revisarOta(LiveUpdate) {
    if (_revisando) return 'en_curso';
    _revisando = true;
    _ultimaRevision = Date.now();
    try {
        const manifest = await leerManifiesto();
        if (!manifest) return 'sin_manifiesto';
        const [{ versionCode }, actual, siguiente] = await Promise.all([
            LiveUpdate.getVersionCode(),
            LiveUpdate.getCurrentBundle(),
            LiveUpdate.getNextBundle(),
        ]);
        const { accion, motivo } = decidirOta({
            manifest,
            ownId: otaOwnId(),
            versionCode,
            currentBundleId: actual?.bundleId ?? null,
            nextBundleId: siguiente?.bundleId ?? null,
            bloqueados: leerBloqueados(),
        });
        if (accion === 'reset') {
            // Sin `reload()`: `reset()` deja el paquete del binario para el próximo arranque.
            await LiveUpdate.reset();
            return 'reset';
        }
        if (accion !== 'descargar') return motivo;
        const { bundleId, url, checksum } = manifest;
        const { bundleIds = [] } = await LiveUpdate.getBundles();
        if (!bundleIds.includes(bundleId)) {
            await LiveUpdate.downloadBundle({ bundleId, url, checksum });
        }
        await LiveUpdate.setNextBundle({ bundleId });
        avisarPreparado(bundleId);
        return 'preparado';
    } catch (err) {
        avisar(err, 'revisar');
        return 'error';
    } finally {
        _revisando = false;
    }
}

let _iniciado = false;

/** Se llama UNA vez desde main.jsx. En la web no hace nada. */
export function iniciarOtaNativa() {
    if (_iniciado || !isNativeApp() || !otaOwnId()) return;
    _iniciado = true;
    let listo = false;
    const confirmar = async () => {
        if (listo) return;
        listo = true;
        try {
            const { LiveUpdate } = await import('@capawesome/capacitor-live-update');
            const r = await LiveUpdate.ready();
            if (r?.rollback) {
                bloquear(r.previousBundleId);
                avisar(new Error('OTA: el paquete no arrancó y se volvió al anterior'), 'rollback', { bundleId: r.previousBundleId });
            }
            avisarSiSeActualizo(LiveUpdate);
            setTimeout(() => { revisarOta(LiveUpdate); }, 4000);
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible' && Date.now() - _ultimaRevision > REVISAR_CADA_MS) {
                    revisarOta(LiveUpdate);
                }
            });
        } catch (err) {
            avisar(err, 'ready');
        }
    };
    window.addEventListener('mealfit:app-ready', confirmar, { once: true });
    // Respaldo: sin red la auth puede tardar más que `readyTimeout` y un paquete SANO
    // no debe pagar por ello. Si a los 6 s React ya pintó algo, el paquete arranca.
    setTimeout(() => {
        if (document.getElementById('root')?.childElementCount) confirmar();
    }, 6000);
}
