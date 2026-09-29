// [P1-PLAN-LOTE-682 · 2026-09-28] Modo voz del coach: el bucle de la conversación.
//
//   escuchando → (calla ~1,5 s) → pensando → hablando (frase a frase mientras llega) → escuchando…
//
// Reglas, y por qué:
//   · El micrófono y la voz NUNCA a la vez: el coach se oiría a sí mismo y se contestaría. Interrumpir es tocar el
//     círculo, no hablarle encima (lo mismo que resolvía el viejo Modo Llamada en iOS).
//   · Cada turno es un mensaje normal del chat (`enviar` = el `handleSend` del chat): cuota, memoria, herramientas y
//     filtros clínicos son los de siempre, y la conversación queda escrita.
//   · Si no oye nada, se PAUSA (nadie quiere un micrófono abierto solo); si el turno no trae nada que decir (sin
//     cuota, sin red), también: volver a escuchar en bucle sería un micrófono que no sirve.
//   · Un toque del usuario abre la primera locución (iOS no deja hablar sin gesto), y al esconder la app se pausa.
// Las piezas puras (idioma, errores, qué se dice y con qué voz) viven en `utils/dictado.js` y `utils/vozDelCoach.js`.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    dictadoContinuo,
    dictadoDisponible,
    idiomasDeDictado,
    leerResultados,
    mensajeDeErrorDeDictado,
    motorDeDictado,
} from '../utils/dictado';
import { crearVozDelCoach, rutaDeAudio, sintesisDisponible } from '../utils/vozDelCoach';
import { pedirVozEnLaNube } from '../utils/vozEnLaNube';
import { sintesisNativa, vozNativaDisponible } from '../utils/vozNativa';
import { triggerMobileHaptic } from '../utils/mobileHaptics';
import { i18nKey } from '../i18n';

/** Silencio tras la última palabra que se toma como «terminó de hablar». */
// [P1-PLAN-LOTE-684] 1,5 s → 1,1 s: medio segundo menos en CADA turno (lo habitual en asistentes de voz: 0,8-1,2 s).
export const VOZ_FIN_DE_FRASE_MS = 1100;
/** Micrófono abierto sin una sola palabra: se pausa. */
export const VOZ_SIN_VOZ_MS = 8000;
/** Tope de un turno hablado (un monólogo no se queda escuchando para siempre). */
export const VOZ_TOPE_ESCUCHA_MS = 45000;
/** Respiro entre que el coach calla y el micrófono se abre (que no se oiga la cola de su propia voz). */
export const VOZ_PAUSA_ANTES_DE_ESCUCHAR_MS = 350;

/** Estados: 'cerrado' | 'escuchando' | 'pensando' | 'hablando' | 'pausa' | 'error'. */
export function useConversacionPorVoz({ locale, esNativa = false, enviar, saludo } = {}) {
    const [disponible] = useState(() => dictadoDisponible({ esNativa }) && sintesisDisponible());
    const [estado, setEstadoVisible] = useState('cerrado');
    const [oido, setOido] = useState('');
    const [dicho, setDicho] = useState('');
    const [error, setError] = useState(null);
    const [pulso, setPulso] = useState(0);

    const estadoRef = useRef('cerrado');
    const setEstado = useCallback((e) => { estadoRef.current = e; setEstadoVisible(e); }, []);
    const enviarRef = useRef(enviar);
    const localeRef = useRef(locale);
    const saludoRef = useRef(saludo);
    useEffect(() => {
        enviarRef.current = enviar;
        localeRef.current = locale;
        saludoRef.current = saludo;
    });

    const vozRef = useRef(null);
    const recRef = useRef(null);
    const sesionRef = useRef(0);
    const oidoRef = useRef('');
    const idiomaRef = useRef(0);
    const finFraseRef = useRef(null);
    const sinVozRef = useRef(null);
    const topeRef = useRef(null);
    const reanudarRef = useRef(null);
    const turnoRef = useRef(false);        // hay un turno del coach en vuelo
    const silenciadoRef = useRef(false);   // el usuario lo interrumpió: el resto de ESTE turno no se dice
    const llegoTextoRef = useRef(false);   // este turno trajo algo que decir
    const escucharRef = useRef(null);
    // Safari puede exigir un toque para cada arranque del micrófono. Si un arranque AUTOMÁTICO se niega, el resto de la
    // sesión sigue por toques («Toca el círculo para hablar») en vez de enseñar un error de permisos que no es tal.
    const soloConToqueRef = useRef(false);

    const soltarTemporizadores = () => {
        for (const r of [finFraseRef, sinVozRef, topeRef, reanudarRef]) {
            if (r.current) clearTimeout(r.current);
            r.current = null;
        }
    };

    // Solo toca refs y setters estables: las devoluciones de la voz se crean una vez y no pueden quedarse viejas.
    const programarEscucha = () => {
        if (reanudarRef.current) clearTimeout(reanudarRef.current);
        reanudarRef.current = setTimeout(() => {
            reanudarRef.current = null;
            if (estadoRef.current === 'cerrado') return;
            if (soloConToqueRef.current) { setEstado('pausa'); return; }
            escucharRef.current?.(false);
        }, VOZ_PAUSA_ANTES_DE_ESCUCHAR_MS);
    };

    const voz = () => {
        if (!vozRef.current) {
            vozRef.current = crearVozDelCoach({
                locale: localeRef.current,
                // [P1-PLAN-LOTE-685] La voz de Gemini (backend /api/chat/voz); sin audio, la del teléfono.
                nube: { pedir: (texto, opciones) => pedirVozEnLaNube(texto, { ...opciones, locale: localeRef.current }) },
                alEmpezarFrase: (frase) => {
                    if (estadoRef.current === 'cerrado') return;
                    setDicho(frase);
                    setEstado('hablando');
                },
                alPalabra: () => setPulso((p) => p + 1),
                alVaciarse: () => {
                    if (estadoRef.current === 'cerrado') return;
                    if (turnoRef.current) { setEstado('pensando'); return; }   // aún pueden llegar frases
                    programarEscucha();
                },
            });
        }
        return vozRef.current;
    };

    const cortarEscucha = () => {
        const rec = recRef.current;
        if (!rec) return;
        sesionRef.current += 1;
        recRef.current = null;
        try { rec.abort(); } catch { /* ya estaba cerrada */ }
    };

    const enviarTexto = async (texto) => {
        const limpio = String(texto || '').replace(/\s+/g, ' ').trim();
        if (!limpio) { setEstado('pausa'); return; }
        setOido(limpio);
        setDicho('');
        setEstado('pensando');
        turnoRef.current = true;
        silenciadoRef.current = false;
        llegoTextoRef.current = false;
        triggerMobileHaptic('light');
        try {
            await enviarRef.current?.(limpio);
        } catch { /* el chat ya enseña su propio error */ }
        turnoRef.current = false;
        if (estadoRef.current === 'cerrado') return;
        if (!llegoTextoRef.current && !silenciadoRef.current) {
            setError(i18nKey('No hubo respuesta. Toca el círculo para intentarlo de nuevo'));
            setEstado('pausa');
            return;
        }
        if (!vozRef.current?.ocupada) programarEscucha();
    };

    const escuchar = useCallback((desdeToque = true) => {
        if (estadoRef.current === 'cerrado') return;
        const Motor = motorDeDictado();
        if (!Motor) {
            setError(mensajeDeErrorDeDictado('start'));
            setEstado('error');
            return;
        }
        soltarTemporizadores();
        vozRef.current?.cancelar();
        cortarEscucha();
        setError(null);
        setOido('');
        setDicho('');
        oidoRef.current = '';
        rutaDeAudio(typeof window !== 'undefined' ? window : undefined, 'auto');

        const idiomas = idiomasDeDictado(localeRef.current);
        const rec = new Motor();
        const id = (sesionRef.current += 1);
        rec.lang = idiomas[Math.min(idiomaRef.current, idiomas.length - 1)];
        rec.interimResults = true;
        rec.continuous = dictadoContinuo();
        rec.maxAlternatives = 1;
        let reintentar = false;
        let fallo = null;
        const terminar = () => {
            if (id !== sesionRef.current) return;
            soltarTemporizadores();
            try { rec.stop(); } catch { /* ya paraba */ }
        };

        rec.onstart = () => {
            if (id !== sesionRef.current) return;
            setEstado('escuchando');
            triggerMobileHaptic('light');
            sinVozRef.current = setTimeout(() => { if (!oidoRef.current) terminar(); }, VOZ_SIN_VOZ_MS);
            topeRef.current = setTimeout(terminar, VOZ_TOPE_ESCUCHA_MS);
        };
        rec.onresult = (evento) => {
            if (id !== sesionRef.current) return;
            const { finales, provisional } = leerResultados(evento.results);
            oidoRef.current = `${finales} ${provisional}`.replace(/\s+/g, ' ').trim();
            setOido(oidoRef.current);
            if (sinVozRef.current) { clearTimeout(sinVozRef.current); sinVozRef.current = null; }
            if (finFraseRef.current) clearTimeout(finFraseRef.current);
            finFraseRef.current = setTimeout(terminar, VOZ_FIN_DE_FRASE_MS);
        };
        rec.onerror = (evento) => {
            if (id !== sesionRef.current) return;
            const code = evento?.error;
            if (code === 'language-not-supported' && idiomaRef.current < idiomas.length - 1) {
                idiomaRef.current += 1;
                reintentar = true;
                return;
            }
            if (code === 'no-speech' || code === 'aborted') return;   // `onend` decide con lo que haya oído
            fallo = code;
        };
        rec.onend = () => {
            if (id !== sesionRef.current) return;
            recRef.current = null;
            soltarTemporizadores();
            if (reintentar) { escucharRef.current?.(desdeToque); return; }
            if (fallo && !desdeToque && (fallo === 'not-allowed' || fallo === 'service-not-allowed')) {
                soloConToqueRef.current = true;
                setEstado('pausa');
                return;
            }
            if (fallo) {
                setError(mensajeDeErrorDeDictado(fallo));
                setEstado('error');
                return;
            }
            const texto = oidoRef.current;
            if (texto) enviarTexto(texto);
            else setEstado('pausa');
        };

        recRef.current = rec;
        try {
            rec.start();
        } catch {
            recRef.current = null;
            if (!desdeToque) {
                soloConToqueRef.current = true;
                setEstado('pausa');
                return;
            }
            setError(mensajeDeErrorDeDictado('start'));
            setEstado('error');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setEstado]);

    useEffect(() => { escucharRef.current = escuchar; }, [escuchar]);

    /** Abrir: dentro del toque del usuario (iOS no deja hablar sin gesto). Saluda y se pone a escuchar. */
    const abrir = useCallback(() => {
        if (!disponible || estadoRef.current !== 'cerrado') return;
        setError(null);
        setOido('');
        setDicho('');
        idiomaRef.current = 0;
        turnoRef.current = false;
        silenciadoRef.current = false;
        soloConToqueRef.current = false;
        const v = voz();
        v.desbloquear();
        triggerMobileHaptic('medium');
        const s = saludoRef.current;
        // [P1-PLAN-LOTE-685] Con la voz de la nube, sin saludo hablado: su audio tardaría ~2 s tras el toque y
        // parecería roto. Se pone a escuchar al instante (el círculo ya dice «Te escucho»).
        if (s && !v.enLaNube) {
            setEstado('hablando');
            v.encolar(s);
        } else {
            setEstado('pensando');
            programarEscucha();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [disponible, setEstado]);

    /** Lo que el coach va diciendo (el chat lo llama con cada frase del stream). */
    const hablar = useCallback((texto) => {
        if (estadoRef.current === 'cerrado' || silenciadoRef.current) return;
        if (!String(texto || '').trim()) return;
        llegoTextoRef.current = true;
        voz().encolar(texto);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /** El círculo: terminar de hablar ya, interrumpir al coach o volver a escuchar. */
    const tocar = useCallback(() => {
        const e = estadoRef.current;
        if (e === 'escuchando') {
            if (finFraseRef.current) clearTimeout(finFraseRef.current);
            try { recRef.current?.stop(); } catch { /* ya paraba */ }
            return;
        }
        if (e === 'hablando' || (e === 'pensando' && turnoRef.current)) {
            silenciadoRef.current = true;
            vozRef.current?.cancelar();
            triggerMobileHaptic('light');
            if (turnoRef.current) { setEstado('pensando'); return; }   // cuando acabe el turno, escucha
            programarEscucha();
            return;
        }
        if (e === 'pausa' || e === 'error') {
            vozRef.current?.desbloquear();
            escuchar(true);
        }
        // `programarEscucha` solo toca refs y setters estables: no hace falta en las dependencias.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [escuchar, setEstado]);

    const cerrar = useCallback(() => {
        setEstado('cerrado');
        soltarTemporizadores();
        cortarEscucha();
        vozRef.current?.cancelar();
        setOido('');
        setDicho('');
        setError(null);
    }, [setEstado]);

    // Chrome carga las voces tarde: pedirlas ya hace que estén cuando el usuario abra el modo voz.
    useEffect(() => {
        if (!disponible) return;
        try {
            if (window.speechSynthesis) window.speechSynthesis.getVoices();
            else if (vozNativaDisponible()) sintesisNativa();   // Android: arranca el motor y pide sus voces ya
        } catch { /* sin voces todavía */ }
    }, [disponible]);

    useEffect(() => {
        const alEsconderse = () => {
            if (!document.hidden || estadoRef.current === 'cerrado') return;
            soltarTemporizadores();
            cortarEscucha();
            vozRef.current?.cancelar();
            setEstado('pausa');
        };
        document.addEventListener('visibilitychange', alEsconderse);
        return () => {
            document.removeEventListener('visibilitychange', alEsconderse);
            soltarTemporizadores();
            cortarEscucha();
            vozRef.current?.destruir();
            vozRef.current = null;
        };
    }, [setEstado]);

    return { disponible, abierto: estado !== 'cerrado', estado, oido, dicho, error, pulso, abrir, cerrar, tocar, hablar };
}
