// [P1-PLAN-LOTE-125 · 2026-09-19] Dictado por voz del chat: el ciclo de vida del micrófono.
//
// Reglas (las decisiones puras —dónde se ofrece, idioma, cómo se une el texto— viven en `utils/dictado.js`):
//
//   · El texto se escribe MIENTRAS se habla: cada resultado repinta «lo que había + lo firme + lo provisional».
//   · Una SESIÓN es una instancia del motor. Cada una lleva un número; `cancelar()` sube el número, así que un
//     resultado que llega tarde (el motor los suelta después de `abort()`) se tira. Es lo que impide que un
//     mensaje ya ENVIADO vuelva a aparecer en la caja.
//   · `detener()` no es `cancelar()`: deja llegar el último resultado firme (el usuario quiere lo que dijo).
//   · Si el usuario toca el texto a mano mientras dicta, manda él: el dictado se apaga con su texto intacto
//     (el chat llama a `cancelar()` en su onChange; un cambio que no venga de teclear lo caza el siguiente resultado).
//   · Un micrófono olvidado se apaga solo (silencio), y también al esconderse la página o desmontarse el chat.
//   · Donde el motor no dicta en continuo (Android) la sesión acaba con cada frase: se reabre sola mientras haya voz.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    DICTADO_SILENCIO_MS,
    DICTADO_SIN_VOZ_MS,
    dictadoContinuo,
    dictadoDisponible,
    idiomasDeDictado,
    leerResultados,
    mensajeDeErrorDeDictado,
    motorDeDictado,
    unirDictado,
} from '../utils/dictado';
import { triggerMobileHaptic } from '../utils/mobileHaptics';
import { avisarEstadoDeVozUnaVez, avisarFalloDeVoz } from '../utils/diagnosticoVoz';
import { safeLocalStorageGet, safeLocalStorageSet } from '../utils/safeLocalStorage';
import { precalentarReconocimientoNativo } from '../utils/vozNativa';

/** Cuánto se queda el aviso de error a la vista (va en el placeholder de la caja). */
export const DICTADO_ERROR_VISIBLE_MS = 4500;
/** Tras pedirle al motor que pare, cuánto se le espera antes de cerrarlo a la fuerza. */
export const DICTADO_CIERRE_MS = 1500;
/** Tope de espera al arranque en frío antes de reintentar automáticamente. */
export const DICTADO_ARRANQUE_MS = 4500;
/** Pausa breve tras abortar una sesión colgada para que iOS suelte el audio antes de reintentar. */
export const DICTADO_REINTENTO_PAUSA_MS = 250;

const _claveIdioma = (loc) => `mf_dictado_lang_${loc || 'es-DO'}`;
const _leerIdiomaGuardado = (loc) => {
    const raw = Number.parseInt(safeLocalStorageGet(_claveIdioma(loc), '0') || '0', 10);
    return Number.isInteger(raw) && raw >= 0 ? raw : 0;
};

export function useDictado({ valor, alCambiar, locale, esNativa = false }) {
    const [disponible] = useState(() => dictadoDisponible({ esNativa }));
    // [P1-PLAN-LOTE-909] Una vez por arranque de la app nativa: si el micrófono se ofrece y con qué motor.
    // `precalentarReconocimientoNativo()` solo corre en iOS: en Android con R8 llamar `checkPermissions()` al montar
    // provoca crash nativo si `app.capgo.**` quedó ofuscado en binarios previos.
    useEffect(() => {
        avisarEstadoDeVozUnaVez({ dictadoDisponible: disponible });
        if (disponible) precalentarReconocimientoNativo();
    }, [disponible]);
    const [escuchando, setEscuchando] = useState(false);
    const [iniciando, setIniciando] = useState(false);
    const [error, setError] = useState(null);

    const valorRef = useRef(valor);
    const alCambiarRef = useRef(alCambiar);
    const localeRef = useRef(locale);
    useEffect(() => {
        valorRef.current = valor;
        alCambiarRef.current = alCambiar;
        localeRef.current = locale;
    });

    const recRef = useRef(null);
    const sesionRef = useRef(0);
    const baseRef = useRef('');
    const firmeRef = useRef('');          // lo firme de sesiones YA cerradas de este dictado
    const deSesionRef = useRef('');       // lo último oído (firme + provisional) en la sesión abierta
    // Lo que ESTE hook escribió hace nada en la caja. Varios y no uno: entre dos resultados seguidos React puede
    // pintar el penúltimo cuando ya se emitió el último, y eso no es «el usuario tocó el texto».
    const emitidosRef = useRef([]);
    const detenidoRef = useRef(false);
    const idiomaRef = useRef(_leerIdiomaGuardado(locale));
    const silencioRef = useRef(null);
    const arranqueTimerRef = useRef(null);
    const reintentoTimerRef = useRef(null);
    const escuchandoRef = useRef(false);
    const esperandoPermisoRef = useRef(false);
    const reintentoArranqueRef = useRef(false);
    const errorTimerRef = useRef(null);
    const arrancarRef = useRef(null);

    const soltarSilencio = () => {
        if (silencioRef.current) clearTimeout(silencioRef.current);
        silencioRef.current = null;
    };

    const soltarArranque = () => {
        if (arranqueTimerRef.current) clearTimeout(arranqueTimerRef.current);
        arranqueTimerRef.current = null;
    };

    const soltarReintento = () => {
        if (reintentoTimerRef.current) clearTimeout(reintentoTimerRef.current);
        reintentoTimerRef.current = null;
    };

    const avisar = useCallback((clave) => {
        if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
        setError(clave);
        if (clave) errorTimerRef.current = setTimeout(() => setError(null), DICTADO_ERROR_VISIBLE_MS);
    }, []);

    const cerrar = useCallback(() => {
        soltarSilencio();
        soltarArranque();
        soltarReintento();
        esperandoPermisoRef.current = false;
        recRef.current = null;
        emitidosRef.current = [];
        escuchandoRef.current = false;
        setIniciando(false);
        setEscuchando(false);
    }, []);

    /** Corta YA y tira lo que el motor aún tuviera en vuelo. El texto de la caja no se toca. */
    const cancelar = useCallback(() => {
        const rec = recRef.current;
        if (!rec && !reintentoTimerRef.current) return;
        soltarReintento();
        sesionRef.current += 1;
        detenidoRef.current = true;
        if (rec) {
            try { rec.abort(); } catch { /* ya estaba cerrado */ }
        }
        cerrar();
    }, [cerrar]);

    /** Deja de escuchar, pero espera el último resultado firme. */
    const detener = useCallback(() => {
        const rec = recRef.current;
        if (!rec) return;
        if (detenidoRef.current) { cancelar(); return; }
        detenidoRef.current = true;
        soltarSilencio();
        soltarArranque();
        soltarReintento();
        try { rec.stop(); } catch { cancelar(); return; }
        // Red: hay motores que tras `stop()` nunca disparan `end`, y el botón se quedaría «escuchando» para siempre.
        silencioRef.current = setTimeout(() => { if (recRef.current === rec) cancelar(); }, DICTADO_CIERRE_MS);
    }, [cancelar]);

    const armarSilencio = useCallback((ms) => {
        soltarSilencio();
        silencioRef.current = setTimeout(detener, ms);
    }, [detener]);

    const arrancarSesion = useCallback(() => {
        const Motor = motorDeDictado();
        if (!Motor) return;
        const idiomas = idiomasDeDictado(localeRef.current);
        const rec = new Motor();
        const id = (sesionRef.current += 1);
        const continuo = dictadoContinuo();
        let huboVoz = false;
        let arrancadoYa = false;
        rec.lang = idiomas[Math.min(idiomaRef.current, idiomas.length - 1)];
        rec.interimResults = true;
        rec.continuous = continuo;
        rec.maxAlternatives = 1;
        rec.onesperandopermiso = (v) => { esperandoPermisoRef.current = Boolean(v); };
        deSesionRef.current = '';

        rec.onstart = () => {
            if (id !== sesionRef.current) return;
            arrancadoYa = true;
            soltarArranque();
            reintentoArranqueRef.current = false;
            escuchandoRef.current = true;
            setIniciando(false);
            setEscuchando(true);
            armarSilencio(DICTADO_SIN_VOZ_MS);
        };
        rec.onresult = (evento) => {
            if (id !== sesionRef.current) return;
            if (!arrancadoYa) {
                arrancadoYa = true;
                soltarArranque();
                reintentoArranqueRef.current = false;
                escuchandoRef.current = true;
                setIniciando(false);
                setEscuchando(true);
            }
            // Si en la caja hay algo que NO escribí yo (ni es lo que había al empezar), alguien la cambió —chat
            // nuevo, una sugerencia, el usuario—: manda eso, y el dictado se apaga sin tocarlo. Aquí y no en un
            // efecto: quien teclea avisa al instante por `cancelar()` (onChange del chat); esto es la red.
            if (![baseRef.current, ...emitidosRef.current].includes(valorRef.current)) { cancelar(); return; }
            const { finales, provisional } = leerResultados(evento.results);
            huboVoz = true;
            deSesionRef.current = `${finales} ${provisional}`;
            const texto = unirDictado(baseRef.current, `${firmeRef.current} ${deSesionRef.current}`);
            emitidosRef.current = [...emitidosRef.current.slice(-5), texto];
            alCambiarRef.current?.(texto);
            if (!detenidoRef.current) armarSilencio(DICTADO_SILENCIO_MS);
        };
        rec.onerror = (evento) => {
            if (id !== sesionRef.current) return;
            soltarArranque();
            const code = evento?.error;
            if (code !== 'aborted') avisarFalloDeVoz({ donde: 'dictado', codigo: code, crudo: evento?.crudo, idioma: rec.lang });
            if (code === 'language-not-supported' && idiomaRef.current < idiomas.length - 1) {
                idiomaRef.current += 1;          // `onend` reabre con el siguiente idioma de la lista
                safeLocalStorageSet(_claveIdioma(localeRef.current), String(idiomaRef.current));
                huboVoz = true;
                return;
            }
            // «no oí nada» tras haber dictado algo no es un error: es el final natural de la frase
            if (code === 'no-speech' && (firmeRef.current || deSesionRef.current).trim()) { detenidoRef.current = true; return; }
            detenidoRef.current = true;
            avisar(mensajeDeErrorDeDictado(code));
        };
        rec.onend = () => {
            if (id !== sesionRef.current) return;
            soltarArranque();
            // iOS a veces nunca marca `isFinal`: lo que quedó a la vista ES lo dictado.
            firmeRef.current = `${firmeRef.current} ${deSesionRef.current}`;
            deSesionRef.current = '';
            recRef.current = null;
            if (!detenidoRef.current && huboVoz && (!continuo || rec.lang !== idiomas[idiomaRef.current])) {
                arrancarRef.current?.();
                return;
            }
            // [P1-PLAN-LOTE-909] Se cerró sin oír nada y sin error: el síntoma del 902 («arranca y no oye»).
            if (!huboVoz && !detenidoRef.current) avisarFalloDeVoz({ donde: 'dictado', codigo: 'sin_resultado', idioma: rec.lang });
            cerrar();
            triggerMobileHaptic('light');
        };

        recRef.current = rec;
        try {
            rec.start();
            if (!arrancadoYa && !detenidoRef.current && recRef.current === rec) {
                soltarArranque();
                const vigilarArranque = () => {
                    if (id !== sesionRef.current || recRef.current !== rec || arrancadoYa || detenidoRef.current) return;
                    if (esperandoPermisoRef.current) {
                        arranqueTimerRef.current = setTimeout(vigilarArranque, DICTADO_ARRANQUE_MS);
                        return;
                    }
                    sesionRef.current += 1;
                    try { rec.abort(); } catch { /* ya cerrado */ }
                    recRef.current = null;
                    if (!reintentoArranqueRef.current) {
                        reintentoArranqueRef.current = true;
                        reintentoTimerRef.current = setTimeout(() => {
                            reintentoTimerRef.current = null;
                            if (!detenidoRef.current) arrancarRef.current?.();
                        }, DICTADO_REINTENTO_PAUSA_MS);
                        return;
                    }
                    avisarFalloDeVoz({ donde: 'dictado', codigo: 'arranque_lento', idioma: rec.lang });
                    cerrar();
                    avisar(mensajeDeErrorDeDictado('start'));
                };
                arranqueTimerRef.current = setTimeout(vigilarArranque, DICTADO_ARRANQUE_MS);
            }
        } catch {
            recRef.current = null;
            cerrar();
            avisar(mensajeDeErrorDeDictado('start'));
        }
    }, [armarSilencio, avisar, cancelar, cerrar]);

    useEffect(() => { arrancarRef.current = arrancarSesion; }, [arrancarSesion]);

    const empezar = useCallback(() => {
        if (!disponible || recRef.current || reintentoTimerRef.current) return;
        avisar(null);
        baseRef.current = valorRef.current || '';
        firmeRef.current = '';
        emitidosRef.current = [];
        detenidoRef.current = false;
        reintentoArranqueRef.current = false;
        setIniciando(true);
        triggerMobileHaptic('light');
        arrancarSesion();
    }, [arrancarSesion, avisar, disponible]);

    const alternar = useCallback(() => {
        if (recRef.current || reintentoTimerRef.current) {
            if (!escuchandoRef.current) cancelar();
            else detener();
        } else {
            empezar();
        }
    }, [cancelar, detener, empezar]);

    useEffect(() => {
        const alEsconderse = () => { if (document.hidden) cancelar(); };
        document.addEventListener('visibilitychange', alEsconderse);
        return () => {
            document.removeEventListener('visibilitychange', alEsconderse);
            if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
            soltarArranque();
            soltarReintento();
            cancelar();
        };
    }, [cancelar]);

    return { disponible, escuchando, iniciando, error, alternar, empezar, detener, cancelar };
}
