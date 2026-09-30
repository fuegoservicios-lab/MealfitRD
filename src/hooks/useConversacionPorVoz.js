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
    esSoloRuido,
    mensajeDeErrorDeDictado,
    motorDeDictado,
} from '../utils/dictado';
import { crearVozDelCoach, rutaDeAudio, sintesisDisponible } from '../utils/vozDelCoach';
import { abrirVozEnLaNube, pedirVozEnLaNube } from '../utils/vozEnLaNube';
import { sintesisNativa, sintesisNativaDisponible } from '../utils/vozNativa';
import { triggerMobileHaptic } from '../utils/mobileHaptics';
import { avisarFalloDeVoz } from '../utils/diagnosticoVoz';
import { i18nKey } from '../i18n';

/** Silencio tras la última palabra que se toma como «terminó de hablar». */
// [P1-PLAN-LOTE-686] El dueño, probándolo: «me corta rápido cuando dejo de hablar; quiero que me deje hablar y que se
// corte de manera muy natural». El reconocedor le entregó «Yo me comí un plátano maduro con dos» (seguía con
// «huevos revueltos»): 1,1 s fijo (684) cortaba cada pausa para pensar. Ahora el silencio depende de CÓMO queda la
// frase: `silencioParaTerminar`.
export const VOZ_FIN_DE_FRASE_MS = 1800;
/** La frase quedó colgando («con dos», «y…», «eh…»): se espera más. */
export const VOZ_FIN_A_MEDIAS_MS = 3000;
/** Una o dos palabras («Hoy…», «Comí…»): suele venir más detrás. */
export const VOZ_FIN_CORTA_MS = 2400;
/** Reaperturas del micrófono por turno cuando el reconocedor se corta solo (Android lo hace en cada pausa). */
export const VOZ_MAX_REAPERTURAS = 8;
/** Micrófono abierto sin una sola palabra: se pausa. */
export const VOZ_SIN_VOZ_MS = 8000;
/** Tope de un turno hablado (un monólogo no se queda escuchando para siempre). */
export const VOZ_TOPE_ESCUCHA_MS = 45000;
/** Respiro entre que el coach calla y el micrófono se abre (que no se oiga la cola de su propia voz). */
export const VOZ_PAUSA_ANTES_DE_ESCUCHAR_MS = 350;
// [P1-PLAN-LOTE-909] Si el reconocedor no dice «ya oigo» (`onstart`) en este tiempo, no se espera más: en Android se
// quedaba en «Pensando…» para siempre. El tiempo en que el teléfono pide el permiso del micrófono no cuenta.
export const VOZ_ARRANQUE_MS = 8000;

/** Estados: 'cerrado' | 'escuchando' | 'pensando' | 'hablando' | 'pausa' | 'error'. */
// Palabras tras las que una frase NO puede haber terminado: conectores, artículos, muletillas y cantidades («con dos»).
// Las de los cinco idiomas de la app; con acentos quitados (se comparan normalizadas).
const PALABRAS_A_MEDIAS = new Set([
    // es
    'y', 'e', 'o', 'u', 'ni', 'con', 'sin', 'de', 'del', 'a', 'al', 'en', 'para', 'por', 'que', 'pero', 'como', 'porque',
    'pues', 'tambien', 'mas', 'muy', 'un', 'una', 'uno', 'unos', 'unas', 'el', 'la', 'los', 'las', 'lo', 'mi', 'mis',
    'tu', 'tus', 'su', 'sus', 'me', 'se', 'le', 'les', 'este', 'esta', 'eh', 'em', 'mmm', 'ehh', 'bueno', 'entonces',
    'cuando', 'medio', 'media', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
    // en
    'and', 'with', 'of', 'the', 'an', 'to', 'for', 'but', 'um', 'uh', 'my', 'some', 'two', 'three', 'four',
    // pt
    'com', 'do', 'da', 'um', 'uma', 'os', 'as', 'mas', 'meu', 'minha', 'dois', 'tres', 'quatro',
    // fr
    'et', 'avec', 'du', 'des', 'le', 'les', 'une', 'mais', 'pour', 'euh', 'deux', 'trois', 'quatre',
    // it
    'di', 'della', 'il', 'ma', 'per', 'ehm', 'due', 'tre', 'quattro',
]);

/** Cuánto silencio da la frase por terminada, según cómo queda: colgando, corta o completa. */
export function silencioParaTerminar(texto) {
    const palabras = String(texto || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
    if (!palabras.length) return VOZ_FIN_A_MEDIAS_MS;
    const ultima = palabras[palabras.length - 1];
    if (PALABRAS_A_MEDIAS.has(ultima) || /^\d+$/.test(ultima)) return VOZ_FIN_A_MEDIAS_MS;
    if (palabras.length <= 2) return VOZ_FIN_CORTA_MS;
    return VOZ_FIN_DE_FRASE_MS;
}

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
    // [P1-PLAN-LOTE-686] Un turno hablado puede durar varias sesiones del reconocedor (se corta solo en las pausas).
    const acumuladoRef = useRef('');   // lo oído en las sesiones anteriores de ESTE turno
    const reaperturasRef = useRef(0);
    const ultimaVozRef = useRef(0);    // cuándo llegó la última palabra
    const inicioTurnoRef = useRef(0);
    const terminarRef = useRef(null);  // el `terminar` de la sesión viva
    const arranqueRef = useRef(null);  // [P1-PLAN-LOTE-909] vigía del arranque del micrófono

    const soltarTemporizadores = () => {
        for (const r of [finFraseRef, sinVozRef, topeRef, reanudarRef, arranqueRef]) {
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
                // [P1-PLAN-LOTE-901] En streaming (`abrir`): el primer audio a ~0,65 s; `pedir` queda de respaldo.
                nube: {
                    abrir: (texto, opciones) => abrirVozEnLaNube(texto, { ...opciones, locale: localeRef.current }),
                    pedir: (texto, opciones) => pedirVozEnLaNube(texto, { ...opciones, locale: localeRef.current }),
                },
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

    const escuchar = useCallback((desdeToque = true, continuar = false) => {
        if (estadoRef.current === 'cerrado') return;
        const Motor = motorDeDictado();
        if (!Motor) {
            setError(mensajeDeErrorDeDictado('start'));
            setEstado('error');
            return;
        }
        soltarTemporizadores();
        // [P1-PLAN-LOTE-686] `continuar`: el reconocedor se cortó SOLO a media frase y se reabre sin perder lo dicho.
        if (!continuar) {
            vozRef.current?.cancelar();
            acumuladoRef.current = '';
            reaperturasRef.current = 0;
            inicioTurnoRef.current = Date.now();
            setError(null);
            setOido('');
            setDicho('');
            oidoRef.current = '';
        }
        cortarEscucha();
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
        let pedido = false;   // el fin lo pidió la app (silencio, toque, tope), no el reconocedor
        const terminar = () => {
            if (id !== sesionRef.current) return;
            pedido = true;
            soltarTemporizadores();
            try { rec.stop(); } catch { /* ya paraba */ }
        };
        terminarRef.current = terminar;   // el toque del círculo también es un fin PEDIDO (no reabre)
        const armarFinDeFrase = (esperaMs) => {
            if (finFraseRef.current) clearTimeout(finFraseRef.current);
            finFraseRef.current = setTimeout(terminar, Math.max(0, esperaMs));
        };
        // Reabrir no es un turno nuevo: si falla, lo ya dicho se manda (Safari puede negar un arranque sin toque).
        const mandarLoAcumulado = () => {
            if (!continuar || !oidoRef.current) return false;
            enviarTexto(oidoRef.current);
            return true;
        };

        rec.onstart = () => {
            if (id !== sesionRef.current) return;
            if (arranqueRef.current) { clearTimeout(arranqueRef.current); arranqueRef.current = null; }
            setEstado('escuchando');
            if (!continuar) triggerMobileHaptic('light');
            sinVozRef.current = setTimeout(() => { if (!oidoRef.current) terminar(); }, VOZ_SIN_VOZ_MS);
            topeRef.current = setTimeout(terminar, Math.max(1000, VOZ_TOPE_ESCUCHA_MS - (Date.now() - inicioTurnoRef.current)));
            // Reabierto: el silencio que ya llevaba cuenta.
            if (continuar && oidoRef.current) {
                armarFinDeFrase(silencioParaTerminar(oidoRef.current) - (Date.now() - ultimaVozRef.current));
            }
        };
        rec.onresult = (evento) => {
            if (id !== sesionRef.current) return;
            const { finales, provisional } = leerResultados(evento.results);
            oidoRef.current = `${acumuladoRef.current} ${finales} ${provisional}`.replace(/\s+/g, ' ').trim();
            setOido(oidoRef.current);
            ultimaVozRef.current = Date.now();
            if (sinVozRef.current) { clearTimeout(sinVozRef.current); sinVozRef.current = null; }
            armarFinDeFrase(silencioParaTerminar(oidoRef.current));
        };
        rec.onerror = (evento) => {
            if (id !== sesionRef.current) return;
            const code = evento?.error;
            // [P1-PLAN-LOTE-909] Diagnóstico anónimo (código y el original de Android, nunca lo dicho).
            if (code !== 'aborted') avisarFalloDeVoz({ donde: 'modo_voz', codigo: code, crudo: evento?.crudo, idioma: rec.lang });
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
            if (fallo && mandarLoAcumulado()) return;
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
            // [P1-PLAN-LOTE-686] Cortado por el reconocedor antes de que el silencio diera la frase por terminada:
            // se reabre y se sigue sumando, en vez de mandar un «con dos» a medias.
            if (!pedido && texto && Date.now() - ultimaVozRef.current < silencioParaTerminar(texto)
                && reaperturasRef.current < VOZ_MAX_REAPERTURAS
                && Date.now() - inicioTurnoRef.current < VOZ_TOPE_ESCUCHA_MS) {
                reaperturasRef.current += 1;
                acumuladoRef.current = texto;
                escucharRef.current?.(false, true);
                return;
            }
            // [P1-PLAN-LOTE-904] Un «ah» o una tos no es un mensaje: se sigue escuchando (con el mismo tope de reaperturas).
            if (texto && esSoloRuido(texto) && reaperturasRef.current < VOZ_MAX_REAPERTURAS
                && Date.now() - inicioTurnoRef.current < VOZ_TOPE_ESCUCHA_MS) {
                reaperturasRef.current += 1;
                acumuladoRef.current = '';
                oidoRef.current = '';
                setOido('');
                escucharRef.current?.(false, true);
                return;
            }
            if (texto && !esSoloRuido(texto)) enviarTexto(texto);
            else setEstado('pausa');
        };

        // [P1-PLAN-LOTE-909] El vigía del arranque: sin `onstart` a tiempo, se corta, se avisa y se ofrece el toque.
        const sinArranque = () => {
            arranqueRef.current = null;
            if (id !== sesionRef.current) return;
            // [P1-PLAN-LOTE-951] `fase`: en qué paso se quedó el reconocedor nativo (el del navegador no la tiene).
            avisarFalloDeVoz({ donde: 'modo_voz', codigo: 'sin_arranque', crudo: rec.fase ? `fase:${rec.fase}` : undefined, idioma: rec.lang });
            cortarEscucha();
            if (mandarLoAcumulado()) return;
            setError(mensajeDeErrorDeDictado('start'));
            setEstado('pausa');
        };
        const armarArranque = () => {
            if (arranqueRef.current) clearTimeout(arranqueRef.current);
            arranqueRef.current = setTimeout(sinArranque, VOZ_ARRANQUE_MS);
        };
        rec.onesperandopermiso = (esperando) => {
            if (id !== sesionRef.current) return;
            if (!esperando) { armarArranque(); return; }
            if (arranqueRef.current) { clearTimeout(arranqueRef.current); arranqueRef.current = null; }
        };

        recRef.current = rec;
        try {
            rec.start();
            armarArranque();
        } catch {
            recRef.current = null;
            if (mandarLoAcumulado()) return;
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
            if (terminarRef.current) terminarRef.current();
            else { try { recRef.current?.stop(); } catch { /* ya paraba */ } }
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
            // [P1-PLAN-LOTE-902] Android con el plugin: SU motor (arranca y pide sus voces ya), aunque el WebView traiga otro.
            if (sintesisNativaDisponible()) sintesisNativa();
            else if (window.speechSynthesis) window.speechSynthesis.getVoices();
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
