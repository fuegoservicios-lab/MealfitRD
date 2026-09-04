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
//  3. `meal_type` por defecto = «Extra (fuera del plan)»: no atenúa platos del plan
//     ni bloquea swap/PDF (P1-EATEN-RECIPE-LOCK). Lo que SÍ es del plan ya tiene
//     «me lo comí» — este modal existe para lo que NO está en el plan.
//  4. El interruptor de Nevera arranca APAGADO: descontar sin pedirlo convierte cada
//     antojo anotado en una mutación de inventario que nadie pidió. Y la Nevera no es
//     solo la Nevera: dispara el congelado del plan.
//  5. «Lo que más registras» RELLENA, no guarda: un toque suelto que escribe produce
//     registros fantasma que se descubren tres días después. Dos toques a propósito.
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import { createPortal } from 'react-dom';
import { X, Search, Plus, Trash2, Loader2, Refrigerator } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth } from '../../config/api';
import { useModalAccessibility } from '../../hooks/useModalAccessibility';
import {
    getCachedMasterList, setCachedMasterList, getCachedDishes, setCachedDishes,
} from '../../utils/pantryCache';
import { searchFoods, previewLine, unitsFor, defaultUnitFor, defaultQtyFor } from '../../utils/foodSearch';
import { getMealTypes, getMealTypeExtra, clampMacro } from './mealLogShared';
import MacroInput from '../common/MacroInput';
import { useT } from '../../i18n';
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

// [P1-EAT-PLAN-MEAL-TRUTH · v3] `initialMealType`: al llegar desde «Comí otra cosa» del plato del plan,
// el componedor abre en el slot de ese plato (almuerzo), no en «Extra»: la sustitución es del almuerzo.
const LogMealModal = ({ onClose, initialMealType = null }) => {
    const t = useT();
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
    const [daysAgo, setDaysAgo] = useState(0);
    const [mealName, setMealName] = useState('');
    const [deductPantry, setDeductPantry] = useState(false);
    const [frequent, setFrequent] = useState([]);
    const [saving, setSaving] = useState(false);
    const [customDraft, setCustomDraft] = useState(null);
    const inputRef = useRef(null);

    const { containerRef } = useModalAccessibility({ isOpen: true, onClose });

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

    const cuerpo = (
        <div className={styles.overlay}>
            <button type="button" className={styles.backdrop} aria-hidden="true" tabIndex={-1} onClick={onClose} />
            <div ref={containerRef} className={styles.panel} role="dialog" aria-modal="true" aria-label={t('Registrar comida')} tabIndex={-1}>
                <div className={styles.head}>
                    <h2 className={styles.title}>{t('Registrar comida')}</h2>
                    <button type="button" className={`${styles.close} ui-close`} onClick={onClose} aria-label={t('Cerrar')}>
                        <X size={20} strokeWidth={2.25} aria-hidden="true" />
                    </button>
                </div>

                <div className={styles.selectors}>
                    <select className={styles.select} value={mealType} onChange={(e) => setMealType(e.target.value)} aria-label={t('Tipo de comida')}>
                        <option value={getMealTypeExtra(t).value}>{getMealTypeExtra(t).label}</option>
                        {getMealTypes(t).map((mt) => <option key={mt.value} value={mt.value}>{mt.label}</option>)}
                    </select>
                    <select className={styles.select} value={daysAgo} onChange={(e) => setDaysAgo(Number(e.target.value))} aria-label={t('Día')}>
                        {_getDayOptions(t).map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                </div>

                {loadFailed ? (
                    <div className={styles.loadError}>
                        <span>{t('No pudimos cargar el catálogo. Revisa tu conexión.')}</span>
                        <button type="button" className={styles.retry} onClick={load}>{t('Reintentar')}</button>
                    </div>
                ) : (
                    <div className={styles.searchWrap}>
                        <Search size={16} className={styles.searchIcon} aria-hidden="true" />
                        <input
                            ref={inputRef}
                            className={styles.search}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={t('Busca un alimento o un plato…')}
                            aria-label={t('Buscar alimento')}
                        />
                        {query.trim().length >= 2 && (
                            <ul className={styles.results} role="listbox">
                                {resultados.map((r) => (
                                    <li key={r.ref}>
                                        <button type="button" className={styles.result} onClick={() => addEntry(r)}>
                                            <span className={styles.resultLabel}>{r.label}</span>
                                            <span className={styles.resultSub}>{r.sub}</span>
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
                                        <span className={styles.resultLabel}>
                                            <Plus size={14} aria-hidden="true" /> {t('Añadir «{nombre}» con macros propias', { nombre: query.trim() })}
                                        </span>
                                        <span className={styles.resultSub}>{t('Para lo que el catálogo no conoce')}</span>
                                    </button>
                                </li>
                            </ul>
                        )}
                    </div>
                )}

                {customDraft && (
                    <div className={styles.customBox}>
                        <span className={styles.customName}>{customDraft.name}</span>
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
                            <button type="button" className={styles.ghostBtn} onClick={() => setCustomDraft(null)}>{t('Cancelar')}</button>
                            <button
                                type="button"
                                className={styles.smallBtn}
                                onClick={() => {
                                    setLines((prev) => [...prev, {
                                        id: `custom-${prev.length}`, ref: 'custom',
                                        name: customDraft.name, macros: customDraft.macros,
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

                {!lines.length && !query && frequent.length > 0 && (
                    <div className={styles.frequent}>
                        <span className={styles.frequentTitle}>{t('Lo que más registras')}</span>
                        <div className={styles.frequentRow}>
                            {frequent.map((f) => (
                                <button
                                    key={f.last_meal_id}
                                    type="button"
                                    className={styles.chip}
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
                                    <span className={styles.chipName}>{f.meal_name}</span>
                                    <span className={styles.chipMeta}>{f.kcal} kcal · {f.veces}×</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {lines.length > 0 && (
                    <div className={styles.plate}>
                        <span className={styles.plateTitle}>{t('Tu plato')}</span>
                        {lines.map((l) => {
                            if (l.ref === 'custom') {
                                return (
                                    <div key={l.id} className={styles.line}>
                                        <span className={styles.lineName}>{l.name}</span>
                                        <span className={styles.lineMeta}>{Math.round(l.macros.kcal)} kcal</span>
                                        <button type="button" className={styles.lineDel} aria-label={t('Quitar {nombre}', { nombre: l.name })}
                                            onClick={() => setLines((prev) => prev.filter((x) => x.id !== l.id))}>
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                );
                            }
                            const pv = previewLine(l.entry, l.qty, l.unit);
                            return (
                                <div key={l.id} className={styles.line}>
                                    <span className={styles.lineName}>{l.entry.label}</span>
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
                                    <button type="button" className={styles.lineDel} aria-label={t('Quitar {nombre}', { nombre: l.entry.label })}
                                        onClick={() => setLines((prev) => prev.filter((x) => x.id !== l.id))}>
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                            );
                        })}

                        <div className={styles.totals}>
                            <span className={styles.totalKcal}>{Math.round(totales.kcal)} kcal</span>
                            <span>P {Math.round(totales.protein)} g</span>
                            <span>C {Math.round(totales.carbs)} g</span>
                            <span>G {Math.round(totales.fats)} g</span>
                        </div>

                        <input
                            className={styles.nameInput}
                            value={mealName}
                            maxLength={200}
                            onChange={(e) => setMealName(e.target.value)}
                            placeholder={t('Nombre (opcional — lo armamos por ti)')}
                            aria-label={t('Nombre de la comida')}
                        />

                        <label className={styles.pantryToggle}>
                            <input
                                type="checkbox"
                                checked={deductPantry}
                                onChange={(e) => setDeductPantry(e.target.checked)}
                            />
                            <Refrigerator size={15} aria-hidden="true" />
                            <span>{t('Descontar de mi Nevera')}</span>
                        </label>
                    </div>
                )}

                <div className={styles.footer}>
                    <button type="button" className={styles.ghostBtn} onClick={onClose}>{t('Cancelar')}</button>
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
    initialMealType: PropTypes.string,
    onClose: PropTypes.func.isRequired,
};

export default LogMealModal;
