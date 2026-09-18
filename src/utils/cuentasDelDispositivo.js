// [P1-PLAN-LOTE-97 · 2026-09-18] Qué cuentas han entrado en ESTE dispositivo, para avisar cuando un acceso con Google
// cae en una que el dispositivo no conoce.
//
// Por qué existe: «Continuar con Google» usa la cuenta de Google que tenga abierta el teléfono, sin preguntar, y desde
// aquí no se puede obligarle a preguntar (lote 96: Neon redirige a Google desde su servidor y su proveedor solo acepta
// client ID y secret). En el iPhone del dueño eso creó una cuenta nueva y vacía con su otro correo sin que se diera
// cuenta. Lo que sí se puede: recordar con qué cuentas se entra aquí y, si Google trae una desconocida mientras había
// otra, preguntar.
//
// Qué se guarda y qué no: el id de la cuenta, el correo ENMASCARADO («an***@gmail.com») y cuándo se vio por última vez.
// Nunca el correo completo: la lista sobrevive al cierre de sesión a propósito (es su razón de ser) y en un teléfono
// compartido la verá la siguiente persona. Máximo 5 cuentas.
import { safeLocalStorageGet, safeLocalStorageSet, safeLocalStorageRemove } from './safeLocalStorage';

const CLAVE_CUENTAS = 'mf_cuentas_dispositivo';
const CLAVE_INICIO_GOOGLE = 'mf_google_inicio';
const MAX_CUENTAS = 5;
// Del clic en «Continuar con Google» a la vuelta a la app. Más allá, el marcador es de un intento abandonado.
const VENTANA_GOOGLE_MS = 15 * 60 * 1000;
// Una cuenta con menos de esto es la que Google acaba de crear.
const VENTANA_CUENTA_NUEVA_MS = 15 * 60 * 1000;

export function enmascararCorreo(correo) {
    const c = String(correo || '').trim();
    const at = c.indexOf('@');
    if (at < 1) return null;
    const usuario = c.slice(0, at);
    const dominio = c.slice(at + 1);
    if (!dominio) return null;
    return `${usuario.slice(0, Math.min(2, usuario.length))}***@${dominio}`;
}

export function leerCuentas() {
    try {
        const lista = JSON.parse(safeLocalStorageGet(CLAVE_CUENTAS, '[]'));
        return Array.isArray(lista) ? lista.filter((x) => x && typeof x.id === 'string') : [];
    } catch {
        return [];
    }
}

export function recordarCuenta(perfil, ahora = Date.now()) {
    if (!perfil?.id) return;
    const correo = enmascararCorreo(perfil.email);
    const resto = leerCuentas().filter((x) => x.id !== perfil.id);
    const lista = [{ id: perfil.id, correo, visto: ahora }, ...resto]
        .sort((a, b) => (b.visto || 0) - (a.visto || 0))
        .slice(0, MAX_CUENTAS);
    safeLocalStorageSet(CLAVE_CUENTAS, JSON.stringify(lista));
}

// Lo llama el login justo antes de salir hacia Google. En localStorage y no en sessionStorage: en el PWA de iOS la
// vuelta del OAuth no siempre conserva la pestaña.
export function marcarInicioGoogle(ahora = Date.now()) {
    safeLocalStorageSet(CLAVE_INICIO_GOOGLE, String(ahora));
}

// Decide si hay que preguntar. Se llama UNA vez cuando el perfil del usuario ya cargó.
//   · Sin acceso con Google reciente: la cuenta se recuerda y no se pregunta (un login con correo es deliberado).
//   · Con acceso con Google: si el dispositivo ya conocía OTRA cuenta y esta no la había visto nunca, se pregunta y NO
//     se recuerda todavía (la recuerda el «sí» del usuario). En cualquier otro caso se recuerda y no se pregunta.
// El marcador de Google se consume siempre: un aviso por acceso, no uno por recarga.
export function evaluarAccesoGoogle(perfil, ahora = Date.now()) {
    const inicio = Number(safeLocalStorageGet(CLAVE_INICIO_GOOGLE, '0')) || 0;
    safeLocalStorageRemove(CLAVE_INICIO_GOOGLE);
    const vieneDeGoogle = inicio > 0 && ahora - inicio >= 0 && ahora - inicio <= VENTANA_GOOGLE_MS;
    const conocidas = leerCuentas();
    const actual = enmascararCorreo(perfil?.email);
    const yaConocida = conocidas.some((x) => x.id === perfil?.id);
    const otra = conocidas.find((x) => x.id !== perfil?.id && x.correo);

    if (!perfil?.id || !vieneDeGoogle || yaConocida || !otra || !actual) {
        recordarCuenta(perfil, ahora);
        return { mostrar: false };
    }
    const creada = Date.parse(perfil.created_at || '');
    const nueva = Number.isFinite(creada) && ahora - creada >= 0 && ahora - creada <= VENTANA_CUENTA_NUEVA_MS;
    return { mostrar: true, actual, anterior: otra.correo, nueva };
}
