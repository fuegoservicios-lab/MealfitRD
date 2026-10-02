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
import { X, RotateCcw, Trash2, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth } from '../../config/api';
import { useModalAccessibility } from '../../hooks/useModalAccessibility';
import { useBottomSheet } from '../../hooks/useBottomSheet';
import { useFotosDeComida } from '../../hooks/useFotosDeComidas';
import { useAssessment } from '../../context/AssessmentContext';
import { formatDate, formatNumber, formatPercent, getLocale, useT } from '../../i18n';
import { nombreDeRegistro, platoDelPlan } from '../../utils/nombreDeRegistro';
import { lineaDeIngredienteLegible } from '../../utils/nombresDeAlimentos';
import { mealDisplay, langDeCampo } from '../../utils/displayMeal';
import { numberRecipeSteps, parseRecipeStep, glossAnnotationLabel } from '../../utils/recipeSteps';
import { mensajeDeError } from '../../utils/errorCopy';
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
        extra: { texto: t('Extra'), color: '#94A3B8' },
    };
};

const aFecha = (raw) => {
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
};

const mismoDia = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

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
    const { containerRef } = useModalAccessibility({ isOpen: true, onClose, isTopmost: () => !eliminandoRef.current });
    const bodyRef = useRef(null);
    const hoja = useBottomSheet({ containerRef, bodyRef, onClose });
    const { planData } = useAssessment() || {};

    const [detalle, setDetalle] = useState({ estado: 'cargando', meal: null });
    const [intento, setIntento] = useState(0);
    const [repitiendo, setRepitiendo] = useState(false);
    const [eliminando, setEliminando] = useState(false);
    const [ampliada, setAmpliada] = useState(false);
    const visorRef = useRef(null);
    const ampliarRef = useRef(null);

    // `undefined` mientras se mira el dispositivo, `null` si no hay foto, la URL si la hay (ver `useFotoDeComida`)
    const fotos = useFotosDeComida(userId, meal?.id);
    const [seleccionada, setSeleccionada] = useState(0);
    const indice = Math.min(seleccionada, Math.max(0, fotos.length - 1));
    const fotoUrl = fotos[indice]?.url;
    const cambiarFoto = (paso) => setSeleccionada((indice + paso + fotos.length) % fotos.length);
    const nombre = nombreDeRegistro(meal?.meal_name, planData, t) || t('Sin nombre');

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
    const horaFiable = !!consumido && (!creado || mismoDia(creado, consumido));
    const hoy = new Date();
    const ayer = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1, 12);
    const franja = getFranjas(t)[String(meal?.meal_type || '').toLowerCase()]
        || { texto: meal?.meal_type ? String(meal.meal_type) : t('Comida'), color: '#94A3B8' };
    let dia = null;
    if (consumido) {
        if (mismoDia(consumido, hoy)) dia = t('Hoy');
        else if (mismoDia(consumido, ayer)) dia = t('Ayer');
        else dia = formatDate(consumido, { weekday: 'short', day: 'numeric', month: 'short' });
    }
    const cuando = [dia, horaFiable ? formatDate(consumido, { timeStyle: 'short' }) : null].filter(Boolean).join(' · ');

    // De dónde vino (`consumed_meals.source`): ya no se pinta [762], pero decide si la receta del plan es la de ESTE plato.
    const fuente = detalle.meal?.source;
    const kcal = num(meal?.calories);
    const metaKcal = num(metas?.calories);
    const macros = [
        { clave: 'protein', rotulo: t('Proteína'), g: num(meal?.protein), meta: num(metas?.protein), color: '#3B82F6' },
        { clave: 'carbs', rotulo: t('Carbos'), g: num(meal?.carbs), meta: num(metas?.carbs), color: '#10B981' },
        { clave: 'fats', rotulo: t('Grasas'), g: num(meal?.healthy_fats ?? meal?.fats), meta: num(metas?.fats), color: '#EC4899' },
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
            const res = await fetchWithAuth('/api/diary/consumed/repeat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source_meal_id: meal.id, meal_type: meal.meal_type || undefined, days_ago: 0 }),
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

    const cuerpo = (
        <div className={styles.overlay}>
            <button type="button" className={styles.backdrop} aria-hidden="true" tabIndex={-1} onClick={onClose} />
            <div
                ref={containerRef}
                className={styles.sheet}
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
                <div className={styles.head} inert={ampliada || undefined}>
                    <span className={styles.grip} aria-hidden="true" />
                    <div className={styles.headRow}>
                        <div className={styles.headText}>
                            <p id="ficha-comida-cuando" className={styles.eyebrow}>
                                <span className={styles.franja} style={{ '--franja': franja.color }}>{franja.texto}</span>
                                {cuando && <span className={styles.cuando}>{` · ${cuando}`}</span>}
                            </p>
                            <h2 id="ficha-comida-titulo" className={styles.title}>{nombre}</h2>
                        </div>
                        <button type="button" className={`${styles.close} ui-close`} onClick={onClose} aria-label={t('Cerrar')}>
                            <X size={20} strokeWidth={2.25} aria-hidden="true" />
                        </button>
                    </div>
                </div>

                <div ref={bodyRef} className={styles.body} inert={ampliada || undefined}>
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
                                        <span>{lineaDeIngredienteLegible(l.texto, t)}</span>
                                        {Number.isFinite(l.kcal) && <span className={styles.ingredienteKcal}>{formatNumber(l.kcal)} kcal</span>}
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
                                <summary className={styles.recetaResumen}>{t('Micronutrientes')}</summary>
                                <MicrosList micros={microsDeLaComida} coverage={{ con_datos: 1, total: 1 }} metas={microMetas} compact showNotes={false} />
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
                                    <summary className={styles.recetaResumen}>{t('Cómo se prepara')}</summary>
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
                </div>

                <div className={styles.footer} inert={ampliada || undefined}>
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
