// [P1-PLAN-LOTE-721 · 2026-09-28] La ficha de un plato registrado en el contador.
//
// El dueño: «¿no sería interesante que se pudiera ver más detalles de la info de los platos que hemos agregado del
// contador de calorías? ejemplo las imágenes de los platos». La fila pintaba nombre, franja y kcal; el único toque era
// la papelera. Ahora la fila abre esta hoja con lo que el diario sabe de ESA comida:
//
//  · la foto del escáner — guardada SOLO en este dispositivo (`utils/fotosDeComidas.js`: la Política de Privacidad
//    publicada promete que el servidor no la retiene), y la hoja lo dice;
//  · cuándo (la hora solo si es de fiar: una comida anotada otro día lleva la hora del REGISTRO, como en el cajón);
//  · de dónde vino (`consumed_meals.source`, lote 720): foto, a mano, estimada por la IA, del plan, el coach, repetida;
//  · kcal y P/C/G con su parte de la meta del día, y los micros de esa comida (los mismos que ya llegan con el día);
//  · los ingredientes, pedidos al abrir (`GET /api/diary/meal/{id}`: la lista del día no los trae), con kcal por
//    renglón SOLO si cuadran con la comida (el servidor lo decide; aquí solo se pinta);
//  · si vino del plan, su descripción y cómo se prepara (`mealDisplay`, en el idioma del usuario);
//  · «Repetir hoy» y «Eliminar» (el borrado es el MISMO de la fila: lo pasa el padre).
//
// Hoja inferior como «Compartir tu día» (portal a <body>, `useModalAccessibility`, `useBottomSheet`), cargada perezosa:
// el trozo del panel está en el techo de `precache-guard`.
//
// [P1-PLAN-LOTE-722 · 2026-09-28] Pulido tras verla en el iPhone del dueño («poco pulido», «¿y lo de la foto?»):
//  · la cabecera dice franja · Hoy/Ayer · hora en UNA línea (con la fecha larga ocupaba dos) y la franja lleva su color,
//    el del cajón de días anteriores; el emoji suelto sale;
//  · una comida escaneada SIN foto en este teléfono lo explica en la hoja (antes: «Escaneada con foto» y ninguna foto);
//  · las macros van en tres columnas alineadas, y «2 unidad de huevo» se lee «2 unidades de huevo»;
//  · «Registrar otra vez hoy» partía en dos líneas: «Repetir hoy».
//
// [P1-PLAN-LOTE-762 · 2026-09-28] El dueño, con la captura de un plato escaneado el 27-sep: «que no aparezcan detalles
// innecesarios». Fuera lo que explica al sistema en vez de al plato: la línea de origen («Escaneada con foto», «Lo
// anotaste el…»), el pie «Solo en este dispositivo», la caja «Sin foto en este teléfono» con su fecha de corte, y el
// porcentaje junto a cada macro (la barra ya lo dice). Los micros, plegados: son para quien los busca. La foto se queda:
// los platos escaneados desde el 28-sep la tienen en el teléfono. La del 27 no existe en ningún sitio (el servidor no
// la guarda y el teléfono aún no la guardaba): sin foto no se pinta nada, no se explica.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { X, RotateCcw, Trash2, Loader2, ChevronLeft, ChevronRight, Minus, Plus, ChevronDown, FlaskConical } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth } from '../../config/api';
import { useModalAccessibility } from '../../hooks/useModalAccessibility';
import { useBottomSheet } from '../../hooks/useBottomSheet';
import { useVisibleViewport } from '../../hooks/useVisibleViewport';
import { useFotosDeComida } from '../../hooks/useFotosDeComidas';
import { useAssessment } from '../../context/AssessmentContext';
import { safeLocalStorageGet, safeLocalStorageRemove } from '../../utils/safeLocalStorage';
import { CHAT_MESSAGES_CACHE_KEY } from '../../utils/chatCacheKeys';
import { formatDate, formatNumber, formatPercent, getLocale, useT } from '../../i18n';
import HealthSources from '../common/HealthSources';
import { nombreDeRegistro, platoDelPlan } from '../../utils/nombreDeRegistro';
import { lineaDeIngredienteLegible } from '../../utils/nombresDeAlimentos';
import { unidadesParaIngrediente, gramosAUnidad, unidadAGramos, atajosParaUnidad } from '../../utils/unidadesDeIngrediente';
import { mealDisplay, langDeCampo } from '../../utils/displayMeal';
import { numberRecipeSteps, parseRecipeStep, glossAnnotationLabel } from '../../utils/recipeSteps';
import { mensajeDeError } from '../../utils/errorCopy';
import { isSameBiologicalDay, isPreviousBiologicalDay } from '../../utils/diaBiologico';
import MicrosList from './MicrosList';
import styles from './FichaDeComida.module.css';

// Las franjas del backend (`meal_type`); las claves NO se traducen. Función: un t() de módulo se congela en español.
// El color es el de la franja en el cajón de días anteriores (`DiaryHistory.getFranjas`): la misma comida se reconoce
// por el mismo color en las dos superficies.
const getFranjas = (t) => {
    return {
        desayuno: { texto: t('Desayuno'), color: '#FBBF24' },
        almuerzo: { texto: t('Almuerzo'), color: '#34D399' },
        merienda: { texto: t('Merienda'), color: '#F472B6' },
        cena: { texto: t('Cena'), color: '#818CF8' },
        snack: { texto: t('Snack'), color: '#94A3B8' },
        suplemento: { texto: t('Suplemento'), color: '#A78BFA' },
        extra: { texto: t('Extra'), color: '#94A3B8' },
    };
};

const aFecha = (raw) => {
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
};

// [P1-PLAN-LOTE-1039] lo que mueve cada toque de −/+ en los gramos de una pieza
const PASO_GRAMOS = 10;
// [P1-PLAN-LOTE-1096] el paso según el tamaño: 10 g de pollo es poco, 10 g de aceite son 90 kcal
const pasoDe = (g) => (g < 20 ? 1 : g < 100 ? 5 : PASO_GRAMOS);
const GRAMOS_MINIMOS = 5;
// [P1-PLAN-LOTE-1098] la cantidad de un renglón sin gramos: tazas y cucharadas de media en media, lo demás de una en una
const MEDIAS = /^(tazas?|cucharadas?|cucharaditas?|vasos?)$/;
const pasoCantidad = (unidad) => (MEDIAS.test(unidad || '') ? 0.5 : 1);
const CANTIDAD_MINIMA = 0.25;

const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : 0;
};

/** El texto en negrita de los pasos del plan (`**…**`), como en las recetas. */
const conNegritas = (texto) => String(texto).split(/(\*\*.*?\*\*)/g).map((parte, i) => (
    parte.startsWith('**') && parte.endsWith('**') ? <strong key={i}>{parte.slice(2, -2)}</strong> : parte
));

const FichaDeComida = ({ meal, userId, metas = null, microMetas = null, onClose, onEliminar = null }) => {
    const t = useT();
    const locale = getLocale();
    // Mientras la confirmación de «Eliminar» está abierta (otro diálogo, fuera de esta hoja) la ficha NO es la capa de
    // arriba: sin esto, Escape cancelaba la confirmación Y cerraba la ficha de una sola tecla.
    const eliminandoRef = useRef(false);
    const editorAbiertoRef = useRef(false);
    const { containerRef } = useModalAccessibility({
        isOpen: true,
        onClose,
        isTopmost: () => !eliminandoRef.current && !editorAbiertoRef.current,
    });
    const bodyRef = useRef(null);
    const hoja = useBottomSheet({ containerRef, bodyRef, onClose });
    const { planData } = useAssessment() || {};

    const [detalle, setDetalle] = useState({ estado: 'cargando', meal: null });
    const [intento, setIntento] = useState(0);
    const [repitiendo, setRepitiendo] = useState(false);
    const [eliminando, setEliminando] = useState(false);
    const [ampliada, setAmpliada] = useState(false);
    // [P1-PLAN-LOTE-1039 · A-41] −/+ de gramos por pieza: los totales que devuelve el servidor sustituyen a los de la
    // lista del día hasta que esta se vuelva a pedir. `ajustando` = índice del renglón en vuelo (uno a la vez).
    const [totales, setTotales] = useState(null);
    const [ajustando, setAjustando] = useState(null);
    // [P1-PLAN-LOTE-1098] tocar la cifra en renglones sin gramos deja escribir la cantidad inline: { i, valor }
    const [escribiendo, setEscribiendo] = useState(null);
    // [P1-UNIDADES-FLEXIBLES · 2026-11-19] unidad elegida por renglón + hoja editora unificada al tocar la cifra
    const [unidadPorLinea, setUnidadPorLinea] = useState({});
    const [editor, setEditor] = useState(null);
    const editorAbierto = Boolean(editor);
    const editorHojaRef = useRef(null);
    const baseGramosRef = useRef({});
    const visorRef = useRef(null);
    const ampliarRef = useRef(null);
    const visibleViewport = useVisibleViewport(editorAbierto);
    const tecladoEditorAbierto = Boolean(
        editorAbierto &&
        visibleViewport &&
        typeof window !== 'undefined' &&
        window.innerHeight - visibleViewport.height >= 120
    );

    useEffect(() => {
        editorAbiertoRef.current = editorAbierto;
        if (!editorAbierto) return undefined;
        // Enfocar la hoja (y NO el <input>) para evitar que iOS/Android abra el teclado virtual al abrir el editor.
        editorHojaRef.current?.focus({ preventScroll: true });
        const onKey = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                setEditor(null);
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [editorAbierto]);

    useEffect(() => {
        if (!editorAbierto) return undefined;
        const id = requestAnimationFrame(() => {
            const panel = editorHojaRef.current;
            const field = document.activeElement;
            if (!panel?.contains(field) || !field.matches('input')) return;
            const bounds = panel.getBoundingClientRect();
            if (bounds.bottom <= bounds.top) return;
            const input = field.getBoundingClientRect();
            if (input.bottom > bounds.bottom - 16) panel.scrollTop += input.bottom - bounds.bottom + 16;
            else if (input.top < bounds.top + 16) panel.scrollTop = Math.max(0, panel.scrollTop - (bounds.top + 16 - input.top));
        });
        return () => cancelAnimationFrame(id);
    }, [editorAbierto, visibleViewport?.top, visibleViewport?.height]);

    // `undefined` mientras se mira el dispositivo, `null` si no hay foto, la URL si la hay (ver `useFotoDeComida`)
    const fotos = useFotosDeComida(userId, meal?.id);
    const [seleccionada, setSeleccionada] = useState(0);
    const indice = Math.min(seleccionada, Math.max(0, fotos.length - 1));
    const fotoUrl = fotos[indice]?.url;
    const cambiarFoto = (paso) => setSeleccionada((indice + paso + fotos.length) % fotos.length);
    const nombre = nombreDeRegistro(meal?.meal_name, planData, t) || t('Sin nombre');
    // [P1-PLAN-LOTE-1170] registrada junta (batido + plato): el título no las pega; cada parte va en su tarjeta
    const nPartesLista = Array.isArray(meal?.partes) ? meal.partes.length : 0;

    useEffect(() => {
        if (!meal?.id) return undefined;
        let vivo = true;
        (async () => {
            try {
                const res = await fetchWithAuth(`/api/diary/meal/${meal.id}`);
                const data = await res.json().catch(() => null);
                if (!vivo) return;
                if (!res.ok || !data?.success || !data.meal) throw new Error('detalle');
                setDetalle({ estado: 'listo', meal: data.meal });
            } catch {
                if (vivo) setDetalle({ estado: 'error', meal: null });
            }
        })();
        return () => { vivo = false; };
    }, [meal?.id, intento]);

    const reintentar = useCallback(() => {
        setDetalle({ estado: 'cargando', meal: null });
        setIntento((n) => n + 1);
    }, []);

    // La foto en grande: Escape la cierra a ELLA (en captura, antes que el Escape de la hoja).
    useEffect(() => {
        if (!ampliada) return undefined;
        const disparador = ampliarRef.current;
        visorRef.current?.querySelector('button')?.focus({ preventScroll: true });
        const onKey = (e) => {
            if (e.key === 'Tab') {
                const botones = [...(visorRef.current?.querySelectorAll('button') || [])];
                const actual = botones.indexOf(document.activeElement);
                botones[(actual + (e.shiftKey ? -1 : 1) + botones.length) % botones.length]?.focus();
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                e.stopPropagation();
                setSeleccionada((n) => (n + (e.key === 'ArrowLeft' ? -1 : 1) + fotos.length) % fotos.length);
                return;
            }
            if (e.key !== 'Escape') return;
            e.preventDefault();
            e.stopPropagation();
            setAmpliada(false);
        };
        window.addEventListener('keydown', onKey, true);
        return () => { window.removeEventListener('keydown', onKey, true); disparador?.focus({ preventScroll: true }); };
    }, [ampliada, fotos.length]);

    const consumido = aFecha(meal?.consumed_at);
    const creado = aFecha(detalle.meal?.created_at || meal?.created_at);
    // Una comida anotada OTRO día lleva la hora del registro, no la de la comida: entonces se dice cuándo se anotó.
    const horaFiable = !!consumido && (!creado || isSameBiologicalDay(creado, consumido));
    const franja = getFranjas(t)[String(meal?.meal_type || '').toLowerCase()]
        || { texto: meal?.meal_type ? String(meal.meal_type) : t('Comida'), color: '#94A3B8' };
    let dia = null;
    if (consumido) {
        if (isSameBiologicalDay(consumido, new Date())) dia = t('Hoy');
        else if (isPreviousBiologicalDay(consumido, new Date())) dia = t('Ayer');
        else dia = formatDate(consumido, { weekday: 'short', day: 'numeric', month: 'short' });
    }
    const cuando = [dia, horaFiable ? formatDate(consumido, { timeStyle: 'short' }) : null].filter(Boolean).join(' · ');

    // De dónde vino (`consumed_meals.source`): ya no se pinta [762], pero decide si la receta del plan es la de ESTE plato.
    const fuente = detalle.meal?.source;
    const vivo = totales || meal;
    const kcal = num(vivo?.calories);
    const partes = Array.isArray(detalle.meal?.partes) ? detalle.meal.partes : [];
    const nPartes = Math.max(partes.length, nPartesLista);
    const metaKcal = num(metas?.calories);
    const macros = [
        { clave: 'protein', rotulo: t('Proteína'), g: num(vivo?.protein), meta: num(metas?.protein), color: '#3B82F6' },
        { clave: 'carbs', rotulo: t('Carbos'), g: num(vivo?.carbs), meta: num(metas?.carbs), color: '#10B981' },
        { clave: 'fats', rotulo: t('Grasas'), g: num(vivo?.healthy_fats ?? vivo?.fats), meta: num(metas?.fats), color: '#EC4899' },
    ];
    const microsDeLaComida = meal?.micros?.values || null;

    // El plato del plan (misma búsqueda que traduce su nombre). Solo si vino del plan, o si la fila es anterior al
    // origen guardado: un «Mangú» escrito a mano no es la receta del plan aunque se llame igual.
    const plato = useMemo(
        () => ((fuente === 'plan_meal' || (detalle.estado === 'listo' && !fuente)) ? platoDelPlan(planData, meal?.meal_name) : null),
        [fuente, detalle.estado, planData, meal?.meal_name],
    );
    const delPlan = plato ? mealDisplay(plato, locale) : null;
    const pasos = delPlan
        ? (Array.isArray(delPlan.recipe) ? delPlan.recipe : (typeof delPlan.recipe === 'string' && delPlan.recipe.trim() ? [delPlan.recipe] : []))
        : [];

    const repetir = async () => {
        if (repitiendo || !meal?.id) return;
        setRepitiendo(true);
        try {
            const sid = safeLocalStorageGet('mealfit_current_session', null);
            const res = await fetchWithAuth('/api/diary/consumed/repeat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source_meal_id: meal.id,
                    meal_type: meal.meal_type || undefined,
                    days_ago: 0,
                    session_id: sid || undefined,
                }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || !data?.success) {
                const msg = res.status === 429
                    ? t('Demasiadas solicitudes seguidas. Espera un momento y reintenta.')
                    : mensajeDeError(data, t('No se pudo registrar. Intenta de nuevo.'), t);
                throw Object.assign(new Error(msg), { paraMostrar: true });
            }
            // El mismo evento que el escáner, el componedor y el chat: la tarjeta y el cajón vuelven a pedir el día.
            window.dispatchEvent(new Event('mealfit:refresh-inventory'));
            // [P1-DIARY-CHAT-BRIDGE · 2026-11-05] Invalidar caché local de chat y notificar al Coach
            safeLocalStorageRemove(CHAT_MESSAGES_CACHE_KEY);
            window.dispatchEvent(new Event('mealfit:refresh-chat'));
            if (data.already_logged) toast.info(t('Esa comida ya estaba registrada hace un momento.'));
            else toast.success(t('Registrada otra vez hoy: {kcal} kcal.', { kcal }));
            onClose?.();
        } catch (e) {
            toast.error(e?.paraMostrar ? e.message : t('No se pudo registrar. Intenta de nuevo.'));
        } finally {
            setRepitiendo(false);
        }
    };

    const eliminar = async () => {
        if (!onEliminar || eliminando) return;
        setEliminando(true);
        eliminandoRef.current = true;
        let borrada = false;
        try {
            borrada = await onEliminar(meal);
        } finally {
            eliminandoRef.current = false;
            setEliminando(false);
        }
        if (borrada) onClose?.();
    };

    const lineas = detalle.meal?.ingredientes?.lineas || [];
    // Capturar los gramos originales de cada renglón la primera vez que carga (ancla de «porción ×»).
    lineas.forEach((l, i) => {
        if (Number.isFinite(l.ajustable_g) && baseGramosRef.current[i] == null) {
            baseGramosRef.current[i] = l.ajustable_g;
        }
    });

    // [P1-PLAN-LOTE-1039 · A-41] La foto no sabe cuánto pesaba la pechuga; quien se la comió, sí. Cada toque manda los
    // gramos NUEVOS de esa pieza y el servidor mueve los totales lo que la pieza aporta según el catálogo (sin IA).
    // [1098] `gramos` (número) o `{ cantidad }` para un renglón sin gramos
    const ajustar = async (indice, gramos) => {
        if (ajustando !== null || !meal?.id) return;
        setAjustando(indice);
        try {
            const res = await fetchWithAuth(`/api/diary/consumed/${meal.id}/gramos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(typeof gramos === 'object' ? { indice, ...gramos } : { indice, gramos }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || !data?.success || !data.meal) throw new Error('ajuste');
            setDetalle({ estado: 'listo', meal: data.meal });
            setTotales({
                calories: data.meal.calories, protein: data.meal.protein,
                carbs: data.meal.carbs, healthy_fats: data.meal.healthy_fats,
            });
            window.dispatchEvent(new Event('mealfit:refresh-inventory'));
        } catch {
            toast.error(t('No se pudo ajustar la cantidad.'));
        } finally {
            setAjustando(null);
        }
    };

    const cuerpo = (
        <div className={styles.overlay}>
            <button type="button" className={styles.backdrop} aria-hidden="true" tabIndex={-1} onClick={onClose} />
            <div
                ref={containerRef}
                className={styles.sheet}
                inert={editorAbierto || undefined}
                role="dialog"
                aria-modal="true"
                aria-labelledby="ficha-comida-titulo"
                aria-describedby="ficha-comida-cuando"
                tabIndex={-1}
                onTouchStart={hoja.onTouchStart}
                onTouchMove={hoja.onTouchMove}
                onTouchEnd={hoja.onTouchEnd}
                onTouchCancel={hoja.onTouchEnd}
            >
                <div className={styles.head} inert={ampliada || editorAbierto || undefined}>
                    <span className={styles.grip} aria-hidden="true" />
                    <div className={styles.headRow}>
                        <div className={styles.headText}>
                            <p id="ficha-comida-cuando" className={styles.eyebrow}>
                                <span className={styles.franja} style={{ '--franja': franja.color }}>{franja.texto}</span>
                                {cuando && <span className={styles.cuando}>{` · ${cuando}`}</span>}
                            </p>
                        </div>
                        <button type="button" className={`${styles.close} ui-close`} onClick={onClose} aria-label={t('Cerrar')}>
                            <X size={20} strokeWidth={2.25} aria-hidden="true" />
                        </button>
                    </div>
                </div>

                <div ref={bodyRef} className={styles.body} inert={ampliada || editorAbierto || undefined}>
                    {/* [P1-PLAN-LOTE-1093] el nombre va en el cuerpo y se desplaza con él: en la cabecera fija, un nombre
                        de cuatro líneas se comía media hoja mientras se miraban los ingredientes */}
                    <h2 id="ficha-comida-titulo" className={styles.title}>{nPartes > 1 ? t('{n} cosas registradas juntas', { n: nPartes }) : nombre}</h2>
                    {fotoUrl && (
                        <figure className={styles.foto}>
                            <button ref={ampliarRef} type="button" className={styles.fotoBtn} onClick={() => setAmpliada(true)} aria-label={t('Ver la foto en grande')}>
                                <img src={fotoUrl} alt={t('Foto de {nombre}', { nombre })} className={styles.fotoImg} />
                            </button>
                            {fotos.length > 1 && (
                                <div className={styles.galeria}>
                                    <div className={styles.miniaturas}>
                                        {fotos.map((foto, i) => (
                                            <button type="button" key={foto.id || i} className={styles.miniatura}
                                                aria-pressed={i === indice} aria-label={`${t('Foto de {nombre}', { nombre })} ${i + 1} / ${fotos.length}`}
                                                onClick={() => setSeleccionada(i)}>
                                                <img src={foto.url} alt="" />
                                            </button>
                                        ))}
                                    </div>
                                    <span className={styles.cuenta} aria-live="polite">{indice + 1} / {fotos.length}</span>
                                </div>
                            )}
                        </figure>
                    )}

                    <section className={styles.energia} aria-label={t('Calorías')}>
                        {nPartes > 1 && <p className={styles.totalRotulo}>{t('Total')}</p>}
                        <div className={styles.kcalFila}>
                            <p className={styles.kcal}>
                                <span className={styles.kcalNum}>{formatNumber(kcal)}</span>
                                <span className={styles.kcalUnidad}>kcal</span>
                            </p>
                            {metaKcal > 0 && (
                                <p className={styles.kcalMeta}>{t('{pct} de tu meta del día', { pct: formatPercent(Math.round((kcal / metaKcal) * 100)) })}</p>
                            )}
                        </div>
                        <ul className={styles.macros}>
                            {macros.map((m) => {
                                const pct = m.meta > 0 ? Math.round((m.g / m.meta) * 100) : null;
                                return (
                                    <li key={m.clave} className={styles.macro}>
                                        <span className={styles.macroRotulo}>{m.rotulo}</span>
                                        <span className={styles.macroValor}>{formatNumber(m.g)} g</span>
                                        <span className={styles.macroPista} aria-hidden="true">
                                            <span className={styles.macroRelleno} style={{ width: `${Math.min(100, pct ?? 0)}%`, background: m.color }} />
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>

                    {partes.length > 1 && (
                        <section className={styles.seccion} aria-labelledby="ficha-comida-partes">
                            <h3 id="ficha-comida-partes" className={styles.seccionTitulo}>{t('Cada una')}</h3>
                            <ul className={styles.partes}>
                                {partes.map((p, i) => (
                                    <li key={i} className={styles.parte}>
                                        <div className={styles.parteCabeza}>
                                            <span className={styles.parteNombre}>{nombreDeRegistro(p.meal_name, planData, t)}</span>
                                            <span className={styles.parteKcal}>{formatNumber(num(p.calories))} <small>kcal</small></span>
                                        </div>
                                        <p className={styles.parteMacros}>
                                            <span><b>{formatNumber(num(p.protein))} g</b> {t('proteína')}</span>
                                            <span><b>{formatNumber(num(p.carbs))} g</b> {t('carbos')}</span>
                                            <span><b>{formatNumber(num(p.healthy_fats))} g</b> {t('grasas')}</span>
                                        </p>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}

                    <section className={styles.seccion} aria-labelledby="ficha-comida-ingredientes">
                        <h3 id="ficha-comida-ingredientes" className={styles.seccionTitulo}>{t('Ingredientes')}</h3>
                        {detalle.estado === 'cargando' && (
                            <div className={styles.cargando} aria-busy="true">
                                <span className={styles.skeleton} />
                                <span className={styles.skeleton} />
                            </div>
                        )}
                        {detalle.estado === 'error' && (
                            <p className={styles.nota}>
                                {t('No pudimos cargar los ingredientes.')}{' '}
                                <button type="button" className={styles.enlace} onClick={reintentar}>{t('Reintentar')}</button>
                            </p>
                        )}
                        {detalle.estado === 'listo' && (lineas.length > 0 ? (
                            <ul className={styles.ingredientes}>
                                {lineas.map((l, i) => (
                                    <li key={`${l.texto}-${i}`} className={styles.ingrediente}>
                                        <span className={styles.ingredienteNombre}>{lineaDeIngredienteLegible(l.texto, t)}</span>
                                        {/* [1093] las kcal SIEMPRE a la derecha (antes la pieza ajustable las perdía) y los
                                            gramos ajustables en su propia línea, debajo */}
                                        {Number.isFinite(l.kcal) && <span className={styles.ingredienteKcal}>{formatNumber(l.kcal)} kcal</span>}
                                        {Number.isFinite(l.ajustable_g) && (() => {
                                            const nombreLegible = lineaDeIngredienteLegible(l.texto, t);
                                            const baseG = baseGramosRef.current[i] ?? l.ajustable_g;
                                            const cfg = unidadesParaIngrediente(l.texto, l.ajustable_g, baseG, t);
                                            const unidadId = unidadPorLinea[i] || cfg.predeterminada;
                                            const opcion = cfg.opciones.find((o) => o.id === unidadId) || cfg.opciones[0];
                                            const esGramos = opcion.id === 'g';
                                            const valorActual = esGramos ? l.ajustable_g : gramosAUnidad(l.ajustable_g, opcion);
                                            const paso = esGramos ? pasoDe(l.ajustable_g) : opcion.paso;
                                            const siguienteMenosG = esGramos
                                                ? l.ajustable_g - paso
                                                : unidadAGramos(valorActual - paso, opcion);
                                            const siguienteMasG = esGramos
                                                ? l.ajustable_g + paso
                                                : unidadAGramos(valorActual + paso, opcion);
                                            const textoValor = opcion.sufijo
                                                ? `${formatNumber(valorActual)}${opcion.sufijo}`
                                                : `${formatNumber(valorActual)} ${opcion.etiqueta}`;
                                            return (
                                                <span className={styles.gramos}>
                                                    <button type="button" className={styles.gramosBtn}
                                                        onClick={() => { if (siguienteMenosG !== null) ajustar(i, siguienteMenosG); }}
                                                        disabled={ajustando !== null || siguienteMenosG === null || siguienteMenosG < GRAMOS_MINIMOS || siguienteMenosG === l.ajustable_g}
                                                        aria-label={esGramos
                                                            ? t('Quitar {n} g', { n: paso })
                                                            : t('Quitar {n} {unidad}', { n: formatNumber(paso), unidad: opcion.etiqueta })}>
                                                        <Minus size={14} strokeWidth={2.5} aria-hidden="true" />
                                                    </button>
                                                    <button type="button" className={styles.gramosValor} aria-live="polite"
                                                        disabled={ajustando !== null}
                                                        aria-label={esGramos
                                                            ? t('Escribir los gramos de {nombre}', { nombre: nombreLegible })
                                                            : t('Escribir la cantidad de {nombre}', { nombre: nombreLegible })}
                                                        onClick={() => setEditor({ i, unidadId: opcion.id, valor: String(valorActual) })}>
                                                        {ajustando === i ? <Loader2 size={14} className="spin-animation" aria-hidden="true" /> : textoValor}
                                                    </button>
                                                    <button type="button" className={styles.gramosBtn}
                                                        onClick={() => { if (siguienteMasG !== null) ajustar(i, siguienteMasG); }}
                                                        disabled={ajustando !== null || siguienteMasG === null || siguienteMasG > 1500 || siguienteMasG === l.ajustable_g}
                                                        aria-label={esGramos
                                                            ? t('Añadir {n} g', { n: paso })
                                                            : t('Añadir {n} {unidad}', { n: formatNumber(paso), unidad: opcion.etiqueta })}>
                                                        <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
                                                    </button>
                                                </span>
                                            );
                                        })()}
                                        {!Number.isFinite(l.ajustable_g) && l.cantidad && Number.isFinite(l.cantidad.valor) && (() => {
                                            const q = l.cantidad;
                                            const paso = pasoCantidad(q.unidad);
                                            const clave = `c${i}`;
                                            return (
                                                <span className={styles.gramos}>
                                                    <button type="button" className={styles.gramosBtn}
                                                        onClick={() => ajustar(i, { cantidad: q.valor - paso })}
                                                        disabled={ajustando !== null || q.valor - paso < CANTIDAD_MINIMA}
                                                        aria-label={t('Quitar {n} {unidad}', { n: formatNumber(paso), unidad: q.unidad })}>
                                                        <Minus size={14} strokeWidth={2.5} aria-hidden="true" />
                                                    </button>
                                                    {escribiendo?.i === clave ? (
                                                        <input
                                                            type="number" inputMode="decimal" step="0.25" min={CANTIDAD_MINIMA} max={30} autoFocus
                                                            className={styles.gramosInput} value={escribiendo.valor}
                                                            aria-label={t('Cantidad de {nombre}', { nombre: lineaDeIngredienteLegible(l.texto, t) })}
                                                            onChange={(e) => setEscribiendo({ i: clave, valor: e.target.value })}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') e.currentTarget.blur();
                                                                if (e.key === 'Escape') setEscribiendo(null);
                                                            }}
                                                            onBlur={() => {
                                                                const v = Math.round(Number(String(escribiendo.valor).replace(',', '.')) * 4) / 4;
                                                                setEscribiendo(null);
                                                                if (Number.isFinite(v) && v >= CANTIDAD_MINIMA && v !== q.valor) ajustar(i, { cantidad: Math.min(30, v) });
                                                            }}
                                                        />
                                                    ) : (
                                                        <button type="button" className={styles.gramosValor} aria-live="polite"
                                                            disabled={ajustando !== null}
                                                            aria-label={t('Escribir la cantidad de {nombre}', { nombre: lineaDeIngredienteLegible(l.texto, t) })}
                                                            onClick={() => setEscribiendo({ i: clave, valor: String(q.valor) })}>
                                                            {ajustando === i ? <Loader2 size={14} className="spin-animation" aria-hidden="true" /> : `${formatNumber(q.valor)} ${q.unidad}`.trim()}
                                                        </button>
                                                    )}
                                                    <button type="button" className={styles.gramosBtn}
                                                        onClick={() => ajustar(i, { cantidad: q.valor + paso })}
                                                        disabled={ajustando !== null || q.valor + paso > 30}
                                                        aria-label={t('Añadir {n} {unidad}', { n: formatNumber(paso), unidad: q.unidad })}>
                                                        <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
                                                    </button>
                                                </span>
                                            );
                                        })()}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className={styles.nota}>{t('Esta comida se registró sin ingredientes.')}</p>
                        ))}
                    </section>

                    {/* [P1-PLAN-LOTE-762] Plegados: para quien los busca. Sin micros, ni sección ni nota técnica. */}
                    {microsDeLaComida && (
                        <section className={styles.seccion} aria-label={t('Micronutrientes')}>
                            <details className={styles.receta}>
                                <summary className={styles.recetaResumen}>
                                    <FlaskConical size={17} strokeWidth={2.2} aria-hidden="true" />
                                    <span>{t('Micronutrientes')}</span>
                                    <ChevronDown size={18} className={styles.recetaFlecha} aria-hidden="true" />
                                </summary>
                                <MicrosList micros={microsDeLaComida} coverage={{ con_datos: 1, total: 1, by_nutrient: Object.fromEntries(Object.entries(meal?.micros?.coverage || {}).map(([key, c]) => [key, { known: c.known > 0 ? 1 : 0, total: 1, status: c.status, sources: meal?.micros?.provenance?.[key] || [] }])) }} metas={microMetas} compact showNotes={false} />
                            </details>
                        </section>
                    )}

                    {delPlan && (delPlan.description || pasos.length > 0) && (
                        <section className={styles.seccion} aria-labelledby="ficha-comida-plan">
                            <h3 id="ficha-comida-plan" className={styles.seccionTitulo}>{t('Del plan')}</h3>
                            {delPlan.description && (
                                <p className={styles.descripcion} lang={langDeCampo(plato, 'description', locale) || undefined}>{delPlan.description}</p>
                            )}
                            {pasos.length > 0 && (
                                <details className={styles.receta}>
                                    <summary className={styles.recetaResumen}>
                                        <span>{t('Cómo se prepara')}</span>
                                        <ChevronDown size={18} className={styles.recetaFlecha} aria-hidden="true" />
                                    </summary>
                                    <ol className={styles.pasos} lang={langDeCampo(plato, 'recipe', locale) || undefined}>
                                        {numberRecipeSteps(pasos).map(({ raw, annotation, number }, i) => {
                                            const { titleKey, body } = parseRecipeStep(raw);
                                            return (
                                                <li key={i} className={annotation ? styles.anotacion : styles.paso}>
                                                    <span className={styles.pasoNum} aria-hidden="true">{annotation ? '•' : number}</span>
                                                    <span>
                                                        {titleKey && <b className={styles.pasoTitulo}>{t(titleKey)} </b>}
                                                        {conNegritas(annotation ? glossAnnotationLabel(body, t) : body)}
                                                    </span>
                                                </li>
                                            );
                                        })}
                                    </ol>
                                </details>
                            )}
                        </section>
                    )}
                    <HealthSources context="tracking" />
                </div>

                <div className={styles.footer} inert={ampliada || editorAbierto || undefined}>
                    <button type="button" className={styles.secundario} onClick={repetir} disabled={repitiendo || eliminando}>
                        {repitiendo
                            ? <Loader2 size={17} className="spin-animation" aria-hidden="true" />
                            : <RotateCcw size={17} strokeWidth={2.4} aria-hidden="true" />}
                        {t('Repetir hoy')}
                    </button>
                    {onEliminar && (
                        <button type="button" className={styles.peligro} onClick={eliminar} disabled={repitiendo || eliminando}>
                            {eliminando
                                ? <Loader2 size={17} className="spin-animation" aria-hidden="true" />
                                : <Trash2 size={17} strokeWidth={2.4} aria-hidden="true" />}
                            {t('Eliminar')}
                        </button>
                    )}
                </div>

                {ampliada && fotoUrl && (
                    <div ref={visorRef} className={styles.visor} role="dialog" aria-modal="true" aria-label={t('Foto de {nombre}', { nombre })}>
                        <button type="button" className={styles.visorCerrar} onClick={() => setAmpliada(false)} aria-label={t('Cerrar')}><X aria-hidden="true" /></button>
                        <img src={fotoUrl} alt={t('Foto de {nombre}', { nombre })} className={styles.visorImg} />
                        {fotos.length > 1 && <div className={styles.visorControles}>
                            <button type="button" onClick={() => cambiarFoto(-1)} aria-label={t('Imagen anterior')}><ChevronLeft aria-hidden="true" /></button>
                            <span aria-live="polite">{indice + 1} / {fotos.length}</span>
                            <button type="button" onClick={() => cambiarFoto(1)} aria-label={t('Imagen siguiente')}><ChevronRight aria-hidden="true" /></button>
                        </div>}
                    </div>
                )}
            </div>

            {editor && lineas[editor.i] && Number.isFinite(lineas[editor.i].ajustable_g) && (() => {
                const idx = editor.i;
                const l = lineas[idx];
                const nombreLegible = lineaDeIngredienteLegible(l.texto, t);
                const tituloCrudo = nombreLegible.replace(/\s*\([^)]*\)\s*$/, '').trim() || nombreLegible;
                const tituloLimpio = tituloCrudo ? `${tituloCrudo.charAt(0).toUpperCase()}${tituloCrudo.slice(1)}` : tituloCrudo;
                const baseG = baseGramosRef.current[idx] ?? l.ajustable_g;
                const cfg = unidadesParaIngrediente(l.texto, l.ajustable_g, baseG, t);
                const opcion = cfg.opciones.find((o) => o.id === editor.unidadId) || cfg.opciones[0];
                const esGramos = opcion.id === 'g';
                const parsed = Number(String(editor.valor).replace(',', '.'));
                const valorValido = Number.isFinite(parsed) && parsed > 0;
                const gramosBorrador = valorValido
                    ? (esGramos ? Math.round(parsed) : unidadAGramos(parsed, opcion))
                    : null;
                const gramosEnRango = Number.isFinite(gramosBorrador) && gramosBorrador >= GRAMOS_MINIMOS && gramosBorrador <= 1500;
                const gPreview = gramosEnRango ? gramosBorrador : l.ajustable_g;
                const kcalPreview = Number.isFinite(l.kcal) && l.ajustable_g > 0
                    ? Math.round((l.kcal * gPreview) / l.ajustable_g)
                    : null;
                const paso = esGramos ? pasoDe(gPreview) : opcion.paso;
                const atajos = atajosParaUnidad(opcion, baseG);

                const moverBorrador = (delta) => {
                    const actual = valorValido ? parsed : (esGramos ? l.ajustable_g : gramosAUnidad(l.ajustable_g, opcion));
                    const nuevo = Math.round((actual + delta) * 100) / 100;
                    const gNuevo = esGramos ? Math.round(nuevo) : unidadAGramos(nuevo, opcion);
                    if (!Number.isFinite(gNuevo) || gNuevo < GRAMOS_MINIMOS || gNuevo > 1500) return;
                    setEditor((prev) => (prev ? { ...prev, valor: String(esGramos ? gNuevo : nuevo) } : prev));
                };

                const cambiarUnidad = (opNueva) => {
                    const gBase = gramosEnRango ? gramosBorrador : l.ajustable_g;
                    const nuevoVal = opNueva.id === 'g' ? gBase : gramosAUnidad(gBase, opNueva);
                    setEditor({ i: idx, unidadId: opNueva.id, valor: String(nuevoVal) });
                };

                const guardar = () => {
                    if (!gramosEnRango) return;
                    const gFinal = Math.min(1500, Math.max(GRAMOS_MINIMOS, gramosBorrador));
                    setUnidadPorLinea((prev) => ({ ...prev, [idx]: opcion.id }));
                    setEditor(null);
                    if (gFinal !== l.ajustable_g) ajustar(idx, gFinal);
                };

                const menosDeshab = !gramosEnRango || (() => {
                    const gM = esGramos ? Math.round(parsed - paso) : unidadAGramos(parsed - paso, opcion);
                    return gM === null || gM < GRAMOS_MINIMOS || gM === gramosBorrador;
                })();
                const masDeshab = !gramosEnRango || (() => {
                    const gP = esGramos ? Math.round(parsed + paso) : unidadAGramos(parsed + paso, opcion);
                    return gP === null || gP > 1500 || gP === gramosBorrador;
                })();

                return (
                    <div className={styles.editorCapa} style={visibleViewport}>
                        <button
                            type="button"
                            className={styles.editorBackdrop}
                            aria-hidden="true"
                            tabIndex={-1}
                            onClick={() => setEditor(null)}
                        />
                        <div
                            ref={editorHojaRef}
                            tabIndex={-1}
                            className={styles.editorHoja}
                            data-teclado={tecladoEditorAbierto ? '1' : undefined}
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="editor-cantidad-titulo"
                        >
                            <div className={styles.editorCabeza}>
                                <div className={styles.editorTitulos}>
                                    <h4 id="editor-cantidad-titulo" className={styles.editorTitulo}>{tituloLimpio}</h4>
                                    <p className={styles.editorResumen} aria-live="polite">
                                        {kcalPreview !== null && <span>{formatNumber(kcalPreview)} kcal</span>}
                                        {kcalPreview !== null && !esGramos && <span className={styles.editorPunto} aria-hidden="true">·</span>}
                                        {!esGramos && <span>≈ {formatNumber(gPreview)} g</span>}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    className={styles.editorCerrar}
                                    onClick={() => setEditor(null)}
                                    aria-label={t('Cerrar')}
                                >
                                    <X size={18} strokeWidth={2.25} aria-hidden="true" />
                                </button>
                            </div>

                            <div className={styles.editorStepper}>
                                <button
                                    type="button"
                                    className={styles.editorPasoBtn}
                                    onClick={() => moverBorrador(-paso)}
                                    disabled={menosDeshab}
                                    aria-label={esGramos
                                        ? t('Quitar {n} g', { n: paso })
                                        : t('Quitar {n} {unidad}', { n: formatNumber(paso), unidad: opcion.etiqueta })}
                                >
                                    <Minus size={18} strokeWidth={2.5} aria-hidden="true" />
                                </button>
                                <label className={styles.editorCampoWrap}>
                                    <input
                                        type="number"
                                        inputMode={esGramos ? 'numeric' : 'decimal'}
                                        step={esGramos ? '1' : '0.25'}
                                        min={opcion.min}
                                        max={opcion.max}
                                        className={styles.editorInput}
                                        value={editor.valor}
                                        aria-label={esGramos
                                            ? t('Gramos de {nombre}', { nombre: nombreLegible })
                                            : t('Cantidad de {nombre}', { nombre: nombreLegible })}
                                        onFocus={(e) => e.target.select()}
                                        onChange={(e) => setEditor((prev) => (prev ? { ...prev, valor: e.target.value } : prev))}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                guardar();
                                            }
                                        }}
                                    />
                                    <span className={styles.editorUnidadInline}>
                                        {opcion.sufijo || opcion.etiqueta}
                                    </span>
                                </label>
                                <button
                                    type="button"
                                    className={styles.editorPasoBtn}
                                    onClick={() => moverBorrador(paso)}
                                    disabled={masDeshab}
                                    aria-label={esGramos
                                        ? t('Añadir {n} g', { n: paso })
                                        : t('Añadir {n} {unidad}', { n: formatNumber(paso), unidad: opcion.etiqueta })}
                                >
                                    <Plus size={18} strokeWidth={2.5} aria-hidden="true" />
                                </button>
                            </div>

                            {atajos.length > 0 && (
                                <div className={styles.editorAtajos}>
                                    {atajos.map((v) => {
                                        const activo = valorValido && Math.abs(parsed - v) < 0.01;
                                        const etiqueta = opcion.sufijo
                                            ? `${formatNumber(v)}${opcion.sufijo}`
                                            : `${formatNumber(v)} ${opcion.etiqueta}`;
                                        return (
                                            <button
                                                key={v}
                                                type="button"
                                                className={styles.editorAtajo}
                                                aria-pressed={activo}
                                                onClick={() => setEditor((prev) => (prev ? { ...prev, valor: String(v) } : prev))}
                                            >
                                                {etiqueta}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {cfg.opciones.length > 1 && (
                                <div className={styles.editorSeccion}>
                                    <span className={styles.editorEtiqueta}>{t('Unidad')}</span>
                                    <div className={styles.editorUnidades} role="group" aria-label={t('Elegir unidad')}>
                                        {cfg.opciones.map((op) => (
                                            <button
                                                key={op.id}
                                                type="button"
                                                className={styles.editorUnidadChip}
                                                aria-pressed={op.id === opcion.id}
                                                onClick={() => cambiarUnidad(op)}
                                            >
                                                {op.etiqueta}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className={styles.editorAcciones}>
                                <button
                                    type="button"
                                    className={styles.editorCancelar}
                                    onClick={() => setEditor(null)}
                                >
                                    {t('Cancelar')}
                                </button>
                                <button
                                    type="button"
                                    className={styles.editorGuardar}
                                    disabled={!gramosEnRango}
                                    onClick={guardar}
                                >
                                    {t('Guardar')}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );

    // Portal a <body>: el panel vive bajo `isolation: isolate` y el cajón de días anteriores ya es un portal; un modal
    // montado dentro no le gana por número a nada de fuera (mismo porqué que «Compartir tu día»).
    return typeof document === 'undefined' ? null : createPortal(cuerpo, document.body);
};

FichaDeComida.propTypes = {
    meal: PropTypes.shape({
        id: PropTypes.string,
        meal_name: PropTypes.string,
        meal_type: PropTypes.string,
        calories: PropTypes.number,
        protein: PropTypes.number,
        carbs: PropTypes.number,
        healthy_fats: PropTypes.number,
        consumed_at: PropTypes.string,
        created_at: PropTypes.string,
        micros: PropTypes.object,
    }).isRequired,
    userId: PropTypes.string,
    metas: PropTypes.shape({ calories: PropTypes.number, protein: PropTypes.number, carbs: PropTypes.number, fats: PropTypes.number }),
    microMetas: PropTypes.object,
    onClose: PropTypes.func.isRequired,
    // `(meal) => Promise<boolean>`: el borrado de la fila (con su confirmación); true = se borró y la hoja se cierra
    onEliminar: PropTypes.func,
};

export default FichaDeComida;
