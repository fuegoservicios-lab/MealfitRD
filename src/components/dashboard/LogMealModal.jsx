// [P1-MANUAL-FOOD-LOG · 2026-08-11] El componedor: registrar una comida SIN foto,
// SIN chat y SIN gastar un crédito, en menos de 15 segundos.
//
// Era el hueco más viejo del diario: había exactamente dos vías de escribir en él
// (la cámara y «me lo comí» sobre un plato del plan), así que quien comía algo en la
// calle no podía anotarlo — y `consumed_meals` tenía 5 filas en total, que es la
// medida de cuánto se usa un diario en el que no se puede escribir.
//
// LAS CINCO DECISIONES de esta pantalla, con su porqué:
//  1. UNA comida = UNA fila. «Arroz, habichuelas y pollo» es una unidad mental; tres
//     filas serían tres borrados para deshacer un almuerzo.
//  2. El cliente manda REFERENCIAS (`dish:`/`food:`/`custom`), nunca macros: la
//     aritmética corre server-side una vez, al enviar (doctrina consumed-from-plan).
//     La vista previa local usa las MISMAS porciones precomputadas que sirve el
//     backend, así los números del preview y del diario no pueden divergir.
//  3. `meal_type` por defecto = «Extra»: no atenúa platos del plan ni bloquea
//     swap/PDF (P1-EATEN-RECIPE-LOCK). Lo que SÍ es del plan ya tiene «me lo comí» —
//     este modal existe para lo que NO está en el plan.
//  4. El interruptor de Nevera arranca APAGADO: descontar sin pedirlo convierte cada
//     antojo anotado en una mutación de inventario que nadie pidió. Y la Nevera no es
//     solo la Nevera: dispara el congelado del plan.
//  5. «Lo que más registras» RELLENA, no guarda: un toque suelto que escribe produce
//     registros fantasma que se descubren tres días después. Dos toques a propósito.
//
// [P1-PLAN-LOTE-99 · 2026-09-18] LA PANTALLA, rehecha (el dueño, con captura del teléfono: «incómodo de
// interactuar y entender… un cambio radical»). Lo que estaba mal y qué lo sustituye:
//  · Era un modal centrado con dos desplegables SIN etiqueta arriba del todo («Extra (fuera del plan)» y
//    «Hoy»): nadie sabía qué preguntaban. Ahora son dos preguntas con chips —«¿Qué comida es?» y
//    «¿Cuándo?»— con todas las opciones a la vista y un toque; «Extra» explica qué es cuando se elige.
//  · «Lo que más registras» era una fila con scroll horizontal y su barra visible: ahora es una lista.
//  · Las cajas de texto iban a 0,9-0,95rem: iOS hace zoom al tocar cualquier campo menor de 16px. Todas a 1rem.
//  · Cada línea del plato metía nombre, cantidad, unidad, gramos y papelera en UNA fila de 300px. Ahora son
//    dos filas: el nombre arriba, los controles debajo.
//  · «Registrar» quedaba apagado sin decir por qué; ahora el pie dice qué falta, y el pie es FIJO: en el
//    teléfono el panel es una hoja inferior con cabecera y pie fijos y el cuerpo desplazable, así el botón
//    no se pierde bajo el teclado.
//  · «Cancelar» sobraba (la X, el fondo y Escape ya cierran): menos botones, menos que entender.
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import { createPortal } from 'react-dom';
import { X, Search, Plus, Trash2, Loader2, Refrigerator, Camera, Sparkles, History } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth } from '../../config/api';
import { useModalAccessibility } from '../../hooks/useModalAccessibility';
import { useBottomSheet } from '../../hooks/useBottomSheet';
import Chips from './Chips';
import {
    getCachedMasterList, setCachedMasterList, getCachedDishes, setCachedDishes,
} from '../../utils/pantryCache';
import { searchFoods, previewLine, unitsFor, defaultUnitFor, defaultQtyFor } from '../../utils/foodSearch';
import { getMealTypes, getMealTypeExtra, clampMacro } from './mealLogShared';
import MacroInput from '../common/MacroInput';
import { formatDate, useT, useTn } from '../../i18n';
import styles from './LogMealModal.module.css';
// [P1-I18N-BACKEND-DETAIL · 2026-08-21] El `detail` del servidor viene
// en español SIEMPRE; el `||` hacía que ganara sobre el fallback traducido.
import { mensajeDeError } from '../../utils/errorCopy';

const _MACRO_CLASSES = {
    field: styles.macroField,
    label: styles.macroLabel,
    wrap: styles.macroInputWrap,
    input: styles.macroInput,
    unit: styles.macroUnit,
};

// Función, no constante: un `t()` en ámbito de módulo se congela en español.
const _getDayOptions = (t) => [
    { value: 0, label: t('Hoy') },
    { value: 1, label: t('Ayer') },
    { value: 2, label: t('Antier') },
];

// [P1-PLAN-LOTE-105] Desde el diario de días anteriores se abre el componedor YA en ese día. Si es más atrás
// que «Antier» (hasta 7, el tope del backend), el día pedido se añade como chip con su fecha: el usuario ve en
// qué día va a quedar y puede cambiarlo; sin el chip, el valor sería invisible y el grupo no marcaría ninguno.
const _getDayOptionsCon = (t, daysAgo) => {
    const base = _getDayOptions(t);
    const n = Number(daysAgo) || 0;
    if (n <= 2 || n > 7) return base;
    const d = new Date();
    d.setDate(d.getDate() - n);
    return [...base, { value: n, label: formatDate(d, { weekday: 'short', day: 'numeric' }) }];
};

// [P1-PLAN-LOTE-106] `Chips` (los grupos excluyentes de «¿Qué comida es?» y «¿Cuándo?») es componente
// compartido con el escáner: ./Chips.jsx.

const LogMealModal = ({ onScan, onClose, initialMealType = null, initialDaysAgo = 0 }) => {
    const t = useT();
    const tn = useTn();
    const [foods, setFoods] = useState(() => getCachedMasterList() || []);
    const [dishes, setDishes] = useState(() => getCachedDishes() || []);
    const [loadFailed, setLoadFailed] = useState(false);
    const [query, setQuery] = useState('');
    const [lines, setLines] = useState([]);
    const [mealType, setMealType] = useState(() => {
        const wanted = String(initialMealType || '').trim().toLowerCase();
        const known = getMealTypes(t).map((o) => o.value);
        return wanted && known.includes(wanted) ? wanted : getMealTypeExtra(t).value;
    });
    const [daysAgo, setDaysAgo] = useState(() => Math.max(0, Math.min(7, Number(initialDaysAgo) || 0)));
    const [mealName, setMealName] = useState('');
    const [deductPantry, setDeductPantry] = useState(false);
    const [frequent, setFrequent] = useState([]);
    const [saving, setSaving] = useState(false);
    const [customDraft, setCustomDraft] = useState(null);
    // [P1-DIARY-FREETEXT-ESTIMATE · 2026-09-04] «Escríbelo y estimamos las macros»
    const [estimating, setEstimating] = useState(false);
    const inputRef = useRef(null);

    const { containerRef } = useModalAccessibility({ isOpen: true, onClose });

    // [P1-PLAN-LOTE-101 · 2026-09-18] Dos cosas del mismo gesto, copiadas de la hoja de actualizar platos
    // (MotivoActualizarModal, P2-SWAP-SHEET-SCROLL v4/v5), sin framer:
    //  1. EL FONDO NO SE MUEVE. El dueño: «todavía sigue igual dando scroll hacia abajo cuando lo cierro». El
    //     `overflow: hidden` del body no frena el toque en iOS y `overscroll-behavior` solo actúa en elementos
    //     que SÍ scrollean: con el cuerpo de la hoja sin desbordar (o en su tope), el pan pasaba a la PÁGINA y al
    //     cerrar el dashboard aparecía desplazado. Listener `touchmove` NO pasivo (React registra el suyo pasivo):
    //     se cancela el pan cuando el cuerpo no puede seguir en esa dirección.
    //  2. DESLIZAR HACIA ABAJO CIERRA, «así como los menús de actualizar platos»: con el cuerpo arriba del todo y
    //     el dedo bajando, la hoja sigue al dedo 1:1 y al soltar cierra por distancia (>70 px) o velocidad, o
    //     vuelve con transición. Si el dedo sube, o el cuerpo no está arriba, el gesto es del scroll; y si el
    //     scroll llega arriba con el dedo aún bajando, la hoja toma el relevo (v4).
    const bodyRef = useRef(null);
    // [P1-PLAN-LOTE-106] el gesto de la hoja (deslizar para cerrar, toque que no pasa al fondo) y la
    // restauración del scroll al cerrar viven en `useBottomSheet`, compartido con el escáner de fotos.
    const hoja = useBottomSheet({ containerRef, bodyRef, onClose, disabled: saving });

    // Catálogo + platos: cache 24 h; si falta, un fetch. FAIL-CLOSED como los paneles
    // de Ajustes: sin catálogo no hay búsqueda que ofrecer, y un buscador vacío que
    // parece «sin resultados» miente sobre lo que hay.
    const load = useCallback(async () => {
        setLoadFailed(false);
        try {
            const tareas = [];
            if (!getCachedMasterList()) {
                tareas.push(fetchWithAuth('/api/catalog').then(async (r) => {
                    if (!r.ok) throw new Error(`HTTP ${r.status}`);
                    const d = await r.json();
                    setCachedMasterList(d.items || []);
                    setFoods(d.items || []);
                }));
            }
            if (!getCachedDishes()) {
                tareas.push(fetchWithAuth('/api/catalog/dishes').then(async (r) => {
                    if (!r.ok) throw new Error(`HTTP ${r.status}`);
                    const d = await r.json();
                    setCachedDishes(d.items || []);
                    setDishes(d.items || []);
                }));
            }
            await Promise.all(tareas);
        } catch {
            setLoadFailed(true);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    // «Lo que más registras» — falla en silencio a lista vacía: es azúcar, no base.
    useEffect(() => {
        let vivo = true;
        fetchWithAuth('/api/diary/foods/frequent?limit=6')
            .then((r) => (r.ok ? r.json() : { items: [] }))
            .then((d) => { if (vivo) setFrequent(d.items || []); })
            .catch(() => { });
        return () => { vivo = false; };
    }, []);

    const resultados = useMemo(
        () => searchFoods(query, foods, dishes, 10),
        [query, foods, dishes],
    );

    const totales = useMemo(() => {
        // [P1-I18N-DASHBOARD] Se llamaba `t`; renombrado a `acc` porque `t` es ahora
        // la función de traducción del componente y tenerla ensombrecida aquí dentro
        // es una trampa para el próximo que añada una cadena en este bloque.
        const acc = { kcal: 0, protein: 0, carbs: 0, fats: 0 };
        for (const l of lines) {
            if (l.ref === 'custom') {
                acc.kcal += l.macros.kcal; acc.protein += l.macros.protein;
                acc.carbs += l.macros.carbs; acc.fats += l.macros.fats;
            } else {
                const p = previewLine(l.entry, l.qty, l.unit);
                acc.kcal += p.kcal; acc.protein += p.protein; acc.carbs += p.carbs; acc.fats += p.fats;
            }
        }
        return acc;
    }, [lines]);

    const addEntry = (entry) => {
        const unit = defaultUnitFor(entry);
        setLines((prev) => [...prev, {
            id: `${entry.ref}-${prev.length}-${prev.reduce((a, x) => a + (x.ref === entry.ref ? 1 : 0), 0)}`,
            ref: entry.ref, entry, qty: defaultQtyFor(entry, unit), unit,
        }]);
        setQuery('');
        inputRef.current?.focus();
    };

    const registrar = async () => {
        if (!lines.length || saving) return;
        setSaving(true);
        try {
            const res = await fetchWithAuth('/api/diary/consumed/manual', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lines: lines.map((l) => (l.ref === 'custom'
                        ? { ref: 'custom', qty: 1, unit: 'g', name: l.name, macros: l.macros }
                        : { ref: l.ref, qty: Number(l.qty) || 0, unit: l.unit })),
                    meal_name: mealName.trim() || undefined,
                    meal_type: mealType,
                    days_ago: daysAgo,
                    deduct_pantry: deductPantry,
                }),
            });
            const data = await res.json().catch(() => null);
            if (res.status === 422) {
                toast.error(mensajeDeError(data, t('Hay una línea que no se pudo resolver. Revísala.'), t));
                return;
            }
            if (!res.ok || !data?.success) {
                throw new Error(data?.message || data?.detail || t('No se pudo registrar.'));
            }
            // Mismo evento que el escáner y el chat: la tarjeta de progreso refetchea.
            window.dispatchEvent(new Event('mealfit:refresh-inventory'));
            if (data.already_logged) {
                toast.info(t('Esa comida ya estaba registrada hace un momento.'));
            } else {
                toast.success(t('Registrado: {kcal} kcal.', { kcal: data.totals?.kcal ?? Math.round(totales.kcal) }));
            }
            // [P1-PANTRY-NAME-RESOLUTION] decir QUÉ no bajó — callarlo es la mentira
            // que aquel P-fix eliminó del chat.
            if (deductPantry && (data.not_in_pantry?.length || data.failed_to_deduct?.length)) {
                const faltan = [...(data.not_in_pantry || []), ...(data.failed_to_deduct || [])];
                toast.info(t('No estaba en tu Nevera: {items}', {
                    items: `${faltan.slice(0, 4).join(', ')}${faltan.length > 4 ? '…' : ''}`,
                }));
            }
            onClose();
        } catch (e) {
            toast.error(e?.message || t('No se pudo registrar. Intenta de nuevo.'));
        } finally {
            setSaving(false);
        }
    };

    // [P1-DIARY-FREETEXT-ESTIMATE · 2026-09-04] Lo que el catálogo no conoce ya se podía añadir,
    // pero SOLO tecleando las cuatro macros: nadie sabe cuánta proteína tiene «un mangú con huevo
    // frito». El backend las estima con el modelo flash y vuelven como BORRADOR editable, marcado
    // como estimado; el registro sigue por la vía `custom` de siempre (sin resta de Nevera).
    const estimarMacros = async () => {
        if (!customDraft || estimating) return;
        setEstimating(true);
        try {
            const res = await fetchWithAuth('/api/diary/consumed/estimate-macros', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: customDraft.name, meal_type: mealType }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data?.operation_failed || !data?.macros) {
                throw new Error(data?.error_message || t('No pudimos estimar las macros ahora; escríbelas tú o inténtalo de nuevo.'));
            }
            const m = data.macros;
            setCustomDraft((p) => (p ? {
                ...p,
                name: String(data.name || p.name).trim() || p.name,
                macros: {
                    kcal: clampMacro('calories', m.kcal),
                    protein: clampMacro('protein', m.protein),
                    carbs: clampMacro('carbs', m.carbs),
                    fats: clampMacro('healthy_fats', m.fats),
                },
                estimated: true,
                portionNote: String(data.portion_note || '').trim(),
            } : p));
        } catch (e) {
            toast.error(e?.message || t('No pudimos estimar las macros ahora; escríbelas tú o inténtalo de nuevo.'));
        } finally {
            setEstimating(false);
        }
    };

    const buscando = query.trim().length >= 2;
    const mealTypeOptions = [...getMealTypes(t), getMealTypeExtra(t)];

    const cuerpo = (
        <div className={styles.overlay}>
            <button type="button" className={styles.backdrop} aria-hidden="true" tabIndex={-1} onClick={onClose} />
            <div
                ref={containerRef}
                className={styles.panel}
                role="dialog"
                aria-modal="true"
                aria-label={t('Registrar comida')}
                tabIndex={-1}
                onTouchStart={hoja.onTouchStart}
                onTouchMove={hoja.onTouchMove}
                onTouchEnd={hoja.onTouchEnd}
                onTouchCancel={hoja.onTouchEnd}
            >
                <div className={styles.head}>
                    <span className={styles.grip} aria-hidden="true" />
                    <div className={styles.headRow}>
                        <h2 className={styles.title}>{t('Registrar comida')}</h2>
                        <button type="button" className={`${styles.close} ui-close`} onClick={onClose} aria-label={t('Cerrar')}>
                            <X size={20} strokeWidth={2.25} aria-hidden="true" />
                        </button>
                    </div>

                    {/* [P1-PLAN-LOTE-85 · 2026-09-17] Las dos vías de registrar, DENTRO del componedor: la
                        tarjeta tiene un solo botón. «Buscar o escribir» es este mismo panel (activa);
                        «Escanear con foto» se lo pide al padre (`onScan`), que cierra esto y abre el escáner. */}
                    {typeof onScan === 'function' && (
                        <div className={styles.modes} role="group" aria-label={t('Cómo registrar')}>
                            <button type="button" className={`${styles.mode} ${styles.modeActive}`} aria-pressed="true">
                                <Search size={15} strokeWidth={2.25} aria-hidden="true" />
                                <span>{t('Buscar o escribir')}</span>
                            </button>
                            <button type="button" className={styles.mode} onClick={onScan} aria-pressed="false" aria-label={t('Escanear con foto')} title={t('Escanear con foto')}>
                                <Camera size={15} strokeWidth={2.25} aria-hidden="true" />
                                <span>{t('Escanear con foto')}</span>
                            </button>
                        </div>
                    )}
                </div>

                <div ref={bodyRef} className={styles.body}>
                    {/* ---- ¿Qué comiste? ---- */}
                    <section className={styles.section} aria-labelledby="lm-que">
                        <h3 id="lm-que" className={styles.sectionTitle}>{t('¿Qué comiste?')}</h3>

                        {loadFailed ? (
                            <div className={styles.loadError}>
                                <span>{t('No pudimos cargar el catálogo. Revisa tu conexión.')}</span>
                                <button type="button" className={styles.retry} onClick={load}>{t('Reintentar')}</button>
                            </div>
                        ) : (
                            <div className={styles.searchWrap}>
                                <Search size={18} className={styles.searchIcon} aria-hidden="true" />
                                <input
                                    ref={inputRef}
                                    className={styles.search}
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder={t('Ej.: arroz, pollo guisado, mangú…')}
                                    aria-label={t('Buscar alimento')}
                                    autoComplete="off"
                                    enterKeyHint="search"
                                />
                            </div>
                        )}

                        {buscando && !loadFailed && !customDraft && (
                            <ul className={styles.results} role="listbox" aria-label={t('Resultados')}>
                                {resultados.map((r) => (
                                    <li key={r.ref}>
                                        <button type="button" className={styles.result} onClick={() => addEntry(r)}>
                                            <span className={styles.resultText}>
                                                <span className={styles.resultLabel}>{r.label}</span>
                                                <span className={styles.resultSub}>{r.sub}</span>
                                            </span>
                                            <span className={styles.resultAdd} aria-hidden="true"><Plus size={18} strokeWidth={2.5} /></span>
                                        </button>
                                    </li>
                                ))}
                                <li>
                                    <button
                                        type="button"
                                        className={`${styles.result} ${styles.resultCustom}`}
                                        onClick={() => setCustomDraft({
                                            name: query.trim(), macros: { kcal: 0, protein: 0, carbs: 0, fats: 0 },
                                        })}
                                    >
                                        <span className={styles.resultText}>
                                            <span className={styles.resultLabel}>{t('Añadir «{nombre}» con macros propias', { nombre: query.trim() })}</span>
                                            <span className={styles.resultSub}>{t('Para lo que el catálogo no conoce')}</span>
                                        </span>
                                        <span className={styles.resultAdd} aria-hidden="true"><Plus size={18} strokeWidth={2.5} /></span>
                                    </button>
                                </li>
                            </ul>
                        )}

                        {customDraft && (
                            <div className={styles.customBox}>
                                <span className={styles.customName}>{customDraft.name}</span>
                                <span className={styles.customHint}>
                                    {t('No está en el catálogo: escribe sus macros o deja que las estimemos.')}
                                </span>
                                {customDraft.estimated && (
                                    <span className={styles.customNote} role="status">
                                        {customDraft.portionNote
                                            ? t('Estimación aproximada ({porcion}); ajústala si sabes más.', { porcion: customDraft.portionNote })
                                            : t('Estimación aproximada; ajústala si sabes más.')}
                                    </span>
                                )}
                                <div className={styles.customGrid}>
                                    <MacroInput classes={_MACRO_CLASSES} label={t('Calorías')} unit="kcal" value={customDraft.macros.kcal}
                                        onChange={(v) => setCustomDraft((p) => ({ ...p, macros: { ...p.macros, kcal: clampMacro('calories', v) } }))} />
                                    <MacroInput classes={_MACRO_CLASSES} label={t('Proteína')} unit="g" value={customDraft.macros.protein}
                                        onChange={(v) => setCustomDraft((p) => ({ ...p, macros: { ...p.macros, protein: clampMacro('protein', v) } }))} />
                                    <MacroInput classes={_MACRO_CLASSES} label={t('Carbs')} unit="g" value={customDraft.macros.carbs}
                                        onChange={(v) => setCustomDraft((p) => ({ ...p, macros: { ...p.macros, carbs: clampMacro('carbs', v) } }))} />
                                    <MacroInput classes={_MACRO_CLASSES} label={t('Grasas')} unit="g" value={customDraft.macros.fats}
                                        onChange={(v) => setCustomDraft((p) => ({ ...p, macros: { ...p.macros, fats: clampMacro('healthy_fats', v) } }))} />
                                </div>
                                <div className={styles.customActions}>
                                    <button type="button" className={styles.estimateBtn} disabled={estimating} onClick={estimarMacros}>
                                        {estimating
                                            ? <Loader2 size={14} className={styles.spin} aria-hidden="true" />
                                            : <Sparkles size={14} aria-hidden="true" />}
                                        {estimating ? t('Estimando…') : t('Estimar macros por mí')}
                                    </button>
                                    <button type="button" className={styles.ghostBtn} onClick={() => setCustomDraft(null)}>{t('Cancelar')}</button>
                                    <button
                                        type="button"
                                        className={styles.smallBtn}
                                        onClick={() => {
                                            setLines((prev) => [...prev, {
                                                id: `custom-${prev.length}`, ref: 'custom',
                                                name: customDraft.name, macros: customDraft.macros,
                                                estimated: !!customDraft.estimated,
                                            }]);
                                            setCustomDraft(null);
                                            setQuery('');
                                        }}
                                    >
                                        {t('Añadir al plato')}
                                    </button>
                                </div>
                            </div>
                        )}

                        {!buscando && !customDraft && !loadFailed && !lines.length && (frequent.length > 0 ? (
                            <div className={styles.frequent}>
                                <span className={styles.subTitle}>
                                    <History size={14} aria-hidden="true" /> {t('Lo que más registras')}
                                </span>
                                <ul className={styles.frequentList}>
                                    {frequent.map((f) => (
                                        <li key={f.last_meal_id}>
                                            <button
                                                type="button"
                                                className={styles.result}
                                                onClick={() => {
                                                    // RELLENA, no guarda: entra como línea custom con
                                                    // los promedios del grupo. El usuario revisa y toca
                                                    // Registrar — el segundo toque es la confirmación.
                                                    setLines((prev) => [...prev, {
                                                        id: `freq-${f.last_meal_id}-${prev.length}`, ref: 'custom',
                                                        name: f.meal_name,
                                                        macros: { kcal: f.kcal || 0, protein: f.protein || 0, carbs: f.carbs || 0, fats: f.fats || 0 },
                                                    }]);
                                                }}
                                            >
                                                <span className={styles.resultText}>
                                                    <span className={styles.resultLabel}>{f.meal_name}</span>
                                                    <span className={styles.resultSub}>{tn(f.veces || 0, '{kcal} kcal · lo registraste {n} vez', '{kcal} kcal · lo registraste {n} veces', { kcal: f.kcal, n: f.veces })}</span>
                                                </span>
                                                <span className={styles.resultAdd} aria-hidden="true"><Plus size={18} strokeWidth={2.5} /></span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : (
                            <p className={styles.hint}>
                                {t('Escribe lo que comiste y toca el resultado para añadirlo. Puedes juntar varios alimentos en un mismo plato.')}
                            </p>
                        ))}
                    </section>

                    {/* ---- Tu plato ---- */}
                    {lines.length > 0 && (
                        <section className={styles.section} aria-labelledby="lm-plato">
                            <h3 id="lm-plato" className={styles.sectionTitle}>
                                <span>{t('Tu plato')}</span>
                                <span className={styles.sectionCount}>{lines.length}</span>
                            </h3>
                            <ul className={styles.plate}>
                                {lines.map((l) => {
                                    if (l.ref === 'custom') {
                                        return (
                                            <li key={l.id} className={styles.line}>
                                                <div className={styles.lineTop}>
                                                    <span className={styles.lineName}>{l.name}</span>
                                                    <button type="button" className={styles.lineDel} aria-label={t('Quitar {nombre}', { nombre: l.name })}
                                                        onClick={() => setLines((prev) => prev.filter((x) => x.id !== l.id))}>
                                                        <Trash2 size={17} aria-hidden="true" />
                                                    </button>
                                                </div>
                                                <div className={styles.lineBottom}>
                                                    <span className={styles.lineMeta}>{Math.round(l.macros.kcal)} kcal{l.estimated ? ` · ${t('estimado')}` : ''}</span>
                                                </div>
                                            </li>
                                        );
                                    }
                                    const pv = previewLine(l.entry, l.qty, l.unit);
                                    return (
                                        <li key={l.id} className={styles.line}>
                                            <div className={styles.lineTop}>
                                                <span className={styles.lineName}>{l.entry.label}</span>
                                                <button type="button" className={styles.lineDel} aria-label={t('Quitar {nombre}', { nombre: l.entry.label })}
                                                    onClick={() => setLines((prev) => prev.filter((x) => x.id !== l.id))}>
                                                    <Trash2 size={17} aria-hidden="true" />
                                                </button>
                                            </div>
                                            <div className={styles.lineBottom}>
                                                <input
                                                    type="number" min="0" step="0.5" inputMode="decimal"
                                                    className={styles.lineQty} value={l.qty}
                                                    aria-label={t('Cantidad de {nombre}', { nombre: l.entry.label })}
                                                    onChange={(e) => setLines((prev) => prev.map((x) => (x.id === l.id ? { ...x, qty: e.target.value } : x)))}
                                                />
                                                <select
                                                    className={styles.lineUnit} value={l.unit}
                                                    aria-label={t('Unidad de {nombre}', { nombre: l.entry.label })}
                                                    onChange={(e) => setLines((prev) => prev.map((x) => (x.id === l.id
                                                        ? { ...x, unit: e.target.value, qty: defaultQtyFor(x.entry, e.target.value) } : x)))}
                                                >
                                                    {unitsFor(l.entry).map((u) => <option key={u.unit} value={u.unit}>{u.label}</option>)}
                                                </select>
                                                <span className={styles.lineMeta}>{Math.round(pv.grams)} g · {Math.round(pv.kcal)} kcal</span>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>

                            <div className={styles.totals}>
                                <span className={styles.totalKcal}>{Math.round(totales.kcal)} <small>kcal</small></span>
                                <span className={styles.totalMacros}>
                                    <span className={styles.totalMacro}><b>{Math.round(totales.protein)} g</b> {t('proteína')}</span>
                                    <span className={styles.totalMacro}><b>{Math.round(totales.carbs)} g</b> {t('carbs')}</span>
                                    <span className={styles.totalMacro}><b>{Math.round(totales.fats)} g</b> {t('grasas')}</span>
                                </span>
                            </div>

                            <input
                                className={styles.nameInput}
                                value={mealName}
                                maxLength={200}
                                onChange={(e) => setMealName(e.target.value)}
                                placeholder={t('Ponle nombre (opcional)')}
                                aria-label={t('Nombre de la comida')}
                            />

                            <label className={styles.pantryToggle}>
                                <input
                                    type="checkbox"
                                    checked={deductPantry}
                                    onChange={(e) => setDeductPantry(e.target.checked)}
                                />
                                <span className={styles.pantryIcon} aria-hidden="true"><Refrigerator size={18} /></span>
                                <span className={styles.pantryText}>
                                    <span>{t('Descontar de mi Nevera')}</span>
                                    <span className={styles.pantrySub}>{t('Resta estos alimentos de lo que tienes guardado.')}</span>
                                </span>
                            </label>
                        </section>
                    )}

                    {/* ---- ¿Qué comida es? / ¿Cuándo? ---- */}
                    <section className={styles.section} aria-labelledby="lm-cual">
                        <h3 id="lm-cual" className={styles.sectionTitle}>{t('¿Qué comida es?')}</h3>
                        <Chips label={t('Tipo de comida')} options={mealTypeOptions} value={mealType} onChange={setMealType} />
                        {mealType === getMealTypeExtra(t).value && (
                            <p className={styles.hint}>{t('Extra: un antojo o picoteo fuera de tus comidas. Cuenta igual.')}</p>
                        )}
                    </section>

                    <section className={styles.section} aria-labelledby="lm-cuando">
                        <h3 id="lm-cuando" className={styles.sectionTitle}>{t('¿Cuándo?')}</h3>
                        <Chips label={t('Día')} options={_getDayOptionsCon(t, initialDaysAgo)} value={daysAgo} onChange={setDaysAgo} />
                    </section>
                </div>

                <div className={styles.footer}>
                    <span className={styles.footerInfo} aria-live="polite">
                        {lines.length
                            ? <><b>{Math.round(totales.kcal)} kcal</b> · {t('{n} en tu plato', { n: lines.length })}</>
                            : t('Añade al menos un alimento para registrar.')}
                    </span>
                    <button
                        type="button"
                        className={styles.primaryBtn}
                        disabled={!lines.length || saving}
                        onClick={registrar}
                    >
                        {saving ? (<><Loader2 size={16} className={styles.spin} /> {t('Registrando…')}</>) : t('Registrar')}
                    </button>
                </div>
            </div>
        </div>
    );

    // Portal a <body>: el dashboard vive bajo `isolation: isolate` (z-scale) y un
    // modal montado dentro no puede ganarle a nada de fuera por número.
    return typeof document === 'undefined' ? null : createPortal(cuerpo, document.body);
};

LogMealModal.propTypes = {
    onScan: PropTypes.func,
    initialMealType: PropTypes.string,
    // [P1-PLAN-LOTE-105] el día en que se abre (0 = hoy … 7): lo pasa el diario de días anteriores
    initialDaysAgo: PropTypes.number,
    onClose: PropTypes.func.isRequired,
};

export default LogMealModal;
