/* ============================================================================
   [P1-SETTINGS-AUTOSAVE · 2026-08-11] Autoguardado de los paneles de Ajustes.

   LA REGLA DE PRODUCTO, que es lo que hay que poder leer de aquí:
   lo que solo te DESCRIBE se guarda solo; lo que cambia tu PLAN te pregunta.
   Por eso Súper Personalización, Mis básicos y Perfil Clínico pierden su botón
   —son descripciones tuyas— y Perfil (General) lo conserva: allí el botón se
   transforma en «Actualizar Plan», que regenera el plan y gasta un crédito
   (P3-PROFILE-METRICS-COMMIT). Un botón que cuesta dinero no se automatiza.

   ── POR QUÉ HAY TRES VELOCIDADES Y NO UNA ──────────────────────────────────
   La primera versión de esto llevaba un único retardo para todo. Está mal, y no
   por gusto: DOS de los tres endpoints lanzan una EXTRACCIÓN LLM + EMBEDDING por
   cada PUT en el que cambie el texto libre — `async_extract_and_save_facts`,
   `backend/routers/user_data.py:986` y `:1197`, gateado por
   `_state["freetext_changed"]` y el knob `MEALFIT_SUPERPERS_EXTRACT_FACTS`.

   Con un temporizador al teclear, cada pausa dentro de un párrafo sería una
   llamada al modelo. Un chip, en cambio, es un UPDATE y nada más. Así que la
   velocidad no la decide la comodidad: la decide el coste.

     · INSTANTANEO  chips, selects, añadir/quitar de una lista  → 400 ms
     · (por defecto) teclear en un campo corto o numérico       → 1200 ms
     · AL_VOLCAR    los textarea de 1500 caracteres             → NUNCA por
                    temporizador; solo al salir del campo, al desmontar o al
                    irse la página.

   El hook no adivina la clase: se la declara el panel por clave. Y **el defecto
   es la lenta** a propósito — si alguien añade un campo y olvida declararlo, lo
   peor que pasa es que su chip tarde 1,2 s. Al revés, un textarea nuevo cayendo
   en la rama rápida serían decenas de llamadas al modelo por párrafo.

   ── LAS CUATRO COSAS QUE PROTEGEN EL DATO ──────────────────────────────────
   1. NUNCA hay dos PUT en vuelo. Los endpoints REEMPLAZAN la sub-clave entera,
      así que dos respuestas fuera de orden no son un detalle de carrera: son el
      cuerpo viejo pisando al nuevo. Con uno solo en vuelo eso es inexpresable.
   2. La BASE con la que se compara es lo que se ENVIÓ, nunca el eco del
      servidor. El backend normaliza (enums, claves vacías, `updatedAt`), así que
      adoptar su eco haría que el diff siguiente dijera «cambió» y el guardado se
      llamaría a sí mismo en bucle. Si un panel sí adopta el eco en su estado,
      que lo devuelva desde `guardar` y base y estado se mueven juntos.
   3. Sin lectura previa no hay escritura. La base se adopta en el FLANCO de
      `habilitado`; sin base, el hook no manda nada. Es el mismo cierre que
      P2-SUPERPERS-FAIL-CLOSED y P1-CLINICAL-FAIL-CLOSED movido a la capa que
      ahora dispara — sin botón, el guard del botón no protege a nadie.
   4. Borrar a propósito SÍ se guarda. El diff es contra la base cargada, no
      contra el vacío, así que vaciar un textarea es un cambio legítimo y viaja.
      Lo que no viaja es un panel que nunca llegó a cargar, que es (3).

   ── VOLCAR SIN PODER ESPERAR ───────────────────────────────────────────────
   La limpieza de un efecto no puede `await` una promesa, y no hace falta:
   cerrar el diálogo NO es una descarga de página. El `fetch` lanzado desde la
   limpieza sale y persiste; lo único que se pierde es el post-proceso (el
   acuse). Eso cubre de un golpe las cuatro formas de cerrar la ventana, el
   «atrás» del navegador y el cambio de sección, porque todas desmontan el panel.

   Lo que sí es una descarga —recargar, cerrar la pestaña, que el móvil mate la
   app— no ejecuta limpiezas y aborta los fetch normales. Para eso van
   `pagehide` y `visibilitychange` con `keepalive: true` (precedente en el repo:
   `Plan.jsx:224`). `beforeunload` no se añade: en móvil no dispara y en
   escritorio no aporta nada sobre `pagehide`.

   NO hay registro global de paneles ni bus de suscripción. Cada panel monta su
   propio hook y el estado sube por una prop. Un singleton de módulo obligaría a
   resetearlo entre pruebas, y esa necesidad es la señal de que un panel puede
   heredar de otro un permiso de escritura que su propia carga no le dio.

   ── CORRECCIÓN, y conviene leerla antes de tocar el acuse ──────────────────
   La primera versión de este comentario decía «solo hay UN panel visible a la
   vez». ES FALSO: la sección `superpers` monta DOS —Súper Personalización y Mis
   básicos—. Lo vio el dueño en una captura, no yo escribiéndolo.

   Con un único valor de acuse ganaba el último en reportar, así que la cabecera
   podía decir «Guardado» por un panel mientras el otro seguía guardando. De ahí
   `acusePrioritario`, abajo: se muestra el PEOR estado, nunca el más optimista.
   Cada panel sigue siendo dueño de su propio guardado; lo único compartido es
   cómo se resumen para una sola línea de texto.
   ========================================================================= */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLatestRef } from './useLatestRef';

/** Un clic ya es una decisión, pero se hacen en ráfaga: marcar cuatro síntomas
 *  son cuatro clics en tres segundos y debe salir un solo PUT. */
export const RETARDO_INSTANTANEO_MS = 400;
/** Tecleo en campos cortos (laboratorios). Por encima de ~1 s deja de sentirse
 *  como «cada tecla» y por debajo se dispara a mitad de un número. */
export const RETARDO_NORMAL_MS = 1200;

/** Serialización estable: `JSON.stringify` no ordena claves, así que un mismo
 *  objeto puede dar dos cadenas distintas y el diff inventaría cambios que no
 *  existen — y cada cambio inventado en `freeText` sería una llamada al modelo. */
export function claveEstable(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
    if (Array.isArray(v)) return `[${v.map(claveEstable).join(',')}]`;
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${claveEstable(v[k])}`).join(',')}}`;
}

const ESTADO_INICIAL = 'inactivo';

/** Orden en que un acuse compartido debe resolver varios paneles a la vez.
 *
 *  Existe porque la sección `superpers` monta DOS paneles y los dos reportan. Con un
 *  solo valor ganaba el último en hablar, y el acuse podía decir «Guardado» por uno
 *  mientras el otro seguía guardando — mentir en la única dirección que importa, la de
 *  afirmar que algo ya está a salvo.
 *
 *  El orden no es casual: un error tapa a todo lo demás, y «guardado» solo se enseña
 *  cuando no queda nada en curso ni pendiente. */
export const PRIORIDAD_ACUSE = ['error', 'guardando', 'pendiente', 'guardado'];

/** El PEOR estado entre varios paneles. `inactivo` si ninguno tiene nada que decir. */
export function acusePrioritario(estados) {
    const vivos = Object.values(estados || {});
    return PRIORIDAD_ACUSE.find((e) => vivos.includes(e)) || 'inactivo';
}

/**
 * @param {object}   opciones
 * @param {object}   opciones.valor        Estado a persistir (objeto plano).
 * @param {Function} opciones.guardar      async (valor) => valorAdoptado | undefined.
 *                                         Debe LANZAR si el guardado falló.
 * @param {boolean}  opciones.habilitado   Solo true tras una carga con éxito.
 * @param {string[]} [opciones.instantaneos] Claves de nivel 1 que van a 400 ms.
 * @param {string[]} [opciones.alVolcar]     Claves que NO usan temporizador.
 * @param {Function} [opciones.onEstado]     Recibe el estado para el acuse.
 */
export default function useAutoguardado({
    valor,
    guardar,
    habilitado,
    instantaneos = [],
    alVolcar = [],
    onEstado,
}) {
    const [estado, setEstado] = useState(ESTADO_INICIAL);

    const valorRef = useLatestRef(valor);
    const guardarRef = useLatestRef(guardar);
    const onEstadoRef = useLatestRef(onEstado);
    const instantaneosRef = useLatestRef(instantaneos);
    const alVolcarRef = useLatestRef(alVolcar);

    /** Lo último que se transmitió, por clave. `null` = aún sin base ⇒ no escribir. */
    const baseRef = useRef(null);
    const temporizadorRef = useRef(null);
    const enVueloRef = useRef(false);
    /** Un cambio llegó mientras había un PUT en vuelo: hay que repetir al acabar. */
    const pendienteRef = useRef(false);
    const montadoRef = useRef(true);

    const anunciar = useCallback((e) => {
        if (montadoRef.current) setEstado(e);
        if (onEstadoRef.current) onEstadoRef.current(e);
    }, [onEstadoRef]);

    /** Claves cuyo valor difiere de la base. Vacío = nada que mandar. */
    const cambiadas = useCallback(() => {
        const base = baseRef.current;
        if (!base) return [];
        const v = valorRef.current || {};
        return Object.keys(v).filter((k) => claveEstable(v[k]) !== base[k]);
    }, [valorRef]);

    const instantanea = useCallback((v) => {
        const foto = {};
        Object.keys(v || {}).forEach((k) => { foto[k] = claveEstable(v[k]); });
        return foto;
    }, []);

    const transmitir = useCallback(async (opciones = {}) => {
        // (3) sin lectura no hay escritura. REDUNDANTE a propósito: `cambiadas()` ya
        // devuelve vacío cuando no hay base, así que quitar esta línea no cambia el
        // comportamiento —lo comprobé por mutación, las 20 pruebas siguen en verde—.
        // Se queda porque la regla que protege el dato tiene que leerse arriba de la
        // función que escribe, no deducirse de lo que devuelve un ayudante.
        if (!baseRef.current) return;
        if (enVueloRef.current) { pendienteRef.current = true; return; }
        if (cambiadas().length === 0) return;

        const enviado = valorRef.current;
        enVueloRef.current = true;
        anunciar('guardando');
        try {
            const adoptado = await guardarRef.current(enviado, opciones);
            // (2) la base es lo ENVIADO, salvo que el panel adopte otra cosa.
            baseRef.current = instantanea(adoptado === undefined ? enviado : adoptado);
            anunciar('guardado');
        } catch {
            anunciar('error');
        } finally {
            enVueloRef.current = false;
            if (pendienteRef.current) {
                pendienteRef.current = false;
                // (1) el siguiente PUT solo arranca cuando el anterior ya acabó.
                transmitir();
            }
        }
    }, [anunciar, cambiadas, guardarRef, instantanea, valorRef]);

    const volcar = useCallback((opciones) => {
        if (temporizadorRef.current) {
            clearTimeout(temporizadorRef.current);
            temporizadorRef.current = null;
        }
        transmitir(opciones);
    }, [transmitir]);

    // Adopción de la base en el flanco de `habilitado`. Mientras sea false la
    // base se suelta, para que un panel que vuelve a fallar no conserve permiso.
    useEffect(() => {
        if (habilitado) {
            if (!baseRef.current) baseRef.current = instantanea(valorRef.current);
        } else {
            baseRef.current = null;
        }
    }, [habilitado, instantanea, valorRef]);

    // El programador. Depende de la serialización del valor y NO del objeto: sin
    // esto, un panel que reconstruye su estado en cada render dispararía un
    // guardado por render.
    const huella = claveEstable(valor);
    useEffect(() => {
        if (!habilitado || !baseRef.current) return undefined;
        const claves = cambiadas();
        if (claves.length === 0) return undefined;

        const soloDiferidas = claves.every((k) => alVolcarRef.current.includes(k));
        if (soloDiferidas) {
            // Hay cambios, pero ninguno que deba viajar por tiempo. El acuse lo
            // dice para que el usuario no crea que ya está a salvo.
            anunciar('pendiente');
            return undefined;
        }

        const retardo = claves.some((k) => instantaneosRef.current.includes(k))
            ? RETARDO_INSTANTANEO_MS
            : RETARDO_NORMAL_MS;

        anunciar('pendiente');
        if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
        temporizadorRef.current = setTimeout(() => {
            temporizadorRef.current = null;
            transmitir();
        }, retardo);

        return () => {
            if (temporizadorRef.current) {
                clearTimeout(temporizadorRef.current);
                temporizadorRef.current = null;
            }
        };
    }, [huella, habilitado, cambiadas, anunciar, transmitir, alVolcarRef, instantaneosRef]);

    // Descarga de página: las limpiezas no corren y los fetch normales mueren.
    useEffect(() => {
        // `pagehide` es incondicional: la página se va, no hay nada que valorar.
        const alIrse = () => volcar({ keepalive: true });
        // `visibilitychange` dispara también al VOLVER; solo interesa el ocultarse,
        // que en iOS es a menudo el último aviso antes de que maten la pestaña.
        const alOcultarse = () => {
            if (document.visibilityState === 'hidden') volcar({ keepalive: true });
        };
        window.addEventListener('pagehide', alIrse);
        document.addEventListener('visibilitychange', alOcultarse);
        return () => {
            window.removeEventListener('pagehide', alIrse);
            document.removeEventListener('visibilitychange', alOcultarse);
        };
    }, [volcar]);

    // Desmontaje: cubre cerrar la ventana por sus cuatro vías, el «atrás» del
    // navegador y el cambio de sección. El fetch sobrevive; el acuse no, y por
    // eso `anunciar` comprueba `montadoRef`.
    useEffect(() => {
        montadoRef.current = true;
        return () => {
            montadoRef.current = false;
            if (temporizadorRef.current) {
                clearTimeout(temporizadorRef.current);
                temporizadorRef.current = null;
            }
            if (baseRef.current && !enVueloRef.current && cambiadas().length > 0) {
                transmitir();
            }
        };
    }, [cambiadas, transmitir]);

    return { estado, volcar };
}
