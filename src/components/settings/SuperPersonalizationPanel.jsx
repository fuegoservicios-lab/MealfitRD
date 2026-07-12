// [P1-SUPERPERSONALIZATION-1 · 2026-06-19] Panel de "Súper Personalización".
// Dimensiones de PREFERENCIA que el wizard no captura (gustos positivos, cocina/
// cultura, restricción religiosa, equipo de cocina, perfil de sabor, nivel de
// cocina) + un texto libre. Persiste en health_profile.super_personalization vía
// el endpoint backend (atómico, I6/I7 — NO escritura directa a DB). Al guardar,
// sincroniza formData.super_personalization para que el plan/chat de la MISMA
// sesión ya lo usen (sin esperar al re-hidratado de login).
//
// ADITIVO: estas señales mejoran selección/tono y excluyen por cultura/religión;
// las alergias/condiciones/medicamentos siguen en sus campos estructurados del
// wizard (este panel NO los toca).
import { useState, useEffect, useCallback } from 'react';
import { Loader2, X, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth } from '../../config/api';
import { useAssessment } from '../../context/AssessmentContext';
import styles from './SuperPersonalizationPanel.module.css';

const ENDPOINT = '/api/user/preferences/super-personalization';
const MAX_TAGS = 30;
const MAX_TAG_LEN = 60;
const MAX_FREETEXT = 1500;

const MAX_OTHER = 80;

const EMPTY = {
    foodLikes: [],
    cuisines: [],
    kitchenEquipment: [],
    religiousRestriction: '',
    religiousRestrictionOther: '',
    cookingSkill: '',
    flavorProfile: {},
    freeText: '',
};

const EQUIPMENT_OPTIONS = [
    'Estufa', 'Horno', 'Microondas', 'Airfryer', 'Licuadora', 'Batidora',
    'Olla de presión', 'Olla arrocera', 'Sartén / Caldero', 'Sandwichera',
    'Tostadora', 'Procesador', 'Parrilla / BBQ',
];
const RELIGION_OPTIONS = [
    { value: '', label: 'Ninguna' },
    { value: 'halal', label: 'Halal (sin cerdo ni alcohol)' },
    { value: 'kosher', label: 'Kosher' },
    { value: 'sin_cerdo', label: 'Sin cerdo' },
    { value: 'sin_res', label: 'Sin carne de res' },
    { value: 'sin_mariscos', label: 'Sin mariscos' },
    { value: 'sin_alcohol', label: 'Sin alcohol' },
    { value: 'otra', label: 'Otra…' },
];
const SKILL_OPTIONS = [
    { value: '', label: 'Sin especificar' },
    { value: 'principiante', label: 'Principiante' },
    { value: 'intermedio', label: 'Intermedio' },
    { value: 'avanzado', label: 'Avanzado' },
];
const FLAVORS = [
    { key: 'picante', label: 'Picante' },
    { key: 'dulce', label: 'Dulce' },
    { key: 'salado', label: 'Salado' },
];
const FLAVOR_LEVELS = [
    { value: '', label: '—' },
    { value: 'bajo', label: 'Bajo' },
    { value: 'medio', label: 'Medio' },
    { value: 'alto', label: 'Alto' },
];

function TagInput({ label, hint, tags, placeholder, onChange }) {
    const [draft, setDraft] = useState('');

    const add = () => {
        const v = draft.trim();
        if (!v) return;
        if (tags.some((t) => t.toLowerCase() === v.toLowerCase())) { setDraft(''); return; }
        if (tags.length >= MAX_TAGS) { toast.error(`Máximo ${MAX_TAGS} elementos.`); return; }
        onChange([...tags, v.slice(0, MAX_TAG_LEN)]);
        setDraft('');
    };

    const onKeyDown = (e) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add();
        } else if (e.key === 'Backspace' && !draft && tags.length) {
            onChange(tags.slice(0, -1));
        }
    };

    return (
        <div className={styles.field}>
            <label className={styles.label}>{label}</label>
            {hint && <p className={styles.hint}>{hint}</p>}
            <div className={styles.tagBox}>
                {tags.map((t) => (
                    <span key={t} className={styles.tag}>
                        {t}
                        <button type="button" aria-label={`Quitar ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}>
                            <X size={13} />
                        </button>
                    </span>
                ))}
                <input
                    className={styles.tagInput}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={onKeyDown}
                    onBlur={add}
                    placeholder={tags.length ? '' : placeholder}
                    maxLength={MAX_TAG_LEN}
                />
                {draft.trim() && (
                    <button type="button" className={styles.tagAdd} onClick={add} aria-label="Añadir">
                        <Plus size={14} />
                    </button>
                )}
            </div>
        </div>
    );
}

export default function SuperPersonalizationPanel({ onSaved }) {
    const { updateData } = useAssessment();
    const [sp, setSp] = useState(EMPTY);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    // [P2-SUPERPERS-FAIL-CLOSED · 2026-07-12] Pre-fix, una carga fallida (red
    // caída, 5xx — el 4xx/5xx ni siquiera mostraba toast) dejaba el panel
    // VACÍO en silencio: si el usuario guardaba en ese estado, sobrescribía
    // sus datos reales con vacío. Ahora: (a) HTTP no-ok también es fallo,
    // (b) 1 reintento automático a los 800ms, (c) si falla, el panel bloquea
    // el Guardar y ofrece Reintentar — fail-closed, jamás save-sobre-vacío.
    const [loadFailed, setLoadFailed] = useState(false);

    const load = useCallback(async (attempt = 0) => {
        setLoading(true);
        setLoadFailed(false);
        let willRetry = false;
        try {
            const res = await fetchWithAuth(ENDPOINT);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const payload = data?.super_personalization || {};
            setSp({
                ...EMPTY,
                ...payload,
                foodLikes: Array.isArray(payload.foodLikes) ? payload.foodLikes : [],
                cuisines: Array.isArray(payload.cuisines) ? payload.cuisines : [],
                kitchenEquipment: Array.isArray(payload.kitchenEquipment) ? payload.kitchenEquipment : [],
                flavorProfile: (payload.flavorProfile && typeof payload.flavorProfile === 'object') ? payload.flavorProfile : {},
                freeText: typeof payload.freeText === 'string' ? payload.freeText : '',
                religiousRestrictionOther: typeof payload.religiousRestrictionOther === 'string' ? payload.religiousRestrictionOther : '',
            });
        } catch {
            if (attempt < 1) {
                willRetry = true;
                setTimeout(() => load(attempt + 1), 800);
            } else {
                setLoadFailed(true);
                toast.error('No se pudo cargar tu súper personalización.');
            }
        } finally {
            if (!willRetry) setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const set = (k, v) => setSp((prev) => ({ ...prev, [k]: v }));
    const setFlavor = (k, v) => setSp((prev) => ({
        ...prev,
        flavorProfile: { ...prev.flavorProfile, [k]: v },
    }));
    const toggleEquip = (item) => set(
        'kitchenEquipment',
        sp.kitchenEquipment.includes(item)
            ? sp.kitchenEquipment.filter((x) => x !== item)
            : [...sp.kitchenEquipment, item],
    );

    const save = async () => {
        // [P2-SUPERPERS-FAIL-CLOSED] Sin una carga exitosa, guardar pisaría
        // los datos reales con el estado vacío del panel.
        if (loading || loadFailed) {
            toast.error('Primero deben cargar tus datos actuales — usa "Reintentar".');
            return;
        }
        setSaving(true);
        try {
            const body = {
                foodLikes: sp.foodLikes,
                cuisines: sp.cuisines,
                kitchenEquipment: sp.kitchenEquipment,
                religiousRestriction: sp.religiousRestriction || '',
                religiousRestrictionOther: sp.religiousRestriction === 'otra' ? (sp.religiousRestrictionOther || '').slice(0, MAX_OTHER) : '',
                cookingSkill: sp.cookingSkill || '',
                flavorProfile: sp.flavorProfile || {},
                freeText: (sp.freeText || '').slice(0, MAX_FREETEXT),
            };
            const res = await fetchWithAuth(ENDPOINT, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const saved = data?.super_personalization || body;
            // Sincroniza formData para que el plan/chat de ESTA sesión lo usen ya.
            try { updateData('super_personalization', saved); } catch { /* no-op */ }
            if (onSaved) onSaved(saved);
            toast.success('Súper personalización guardada. La IA la usará en tus próximos planes y respuestas.');
        } catch {
            toast.error('No se pudo guardar. Intenta de nuevo.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className={styles.loading}>
                <Loader2 size={22} className={styles.spin} />
                <span>Cargando tu súper personalización…</span>
            </div>
        );
    }

    // [P2-SUPERPERS-FAIL-CLOSED] Carga fallida → panel bloqueado con retry,
    // NUNCA formulario vacío editable (guardarlo pisaría los datos reales).
    if (loadFailed) {
        return (
            <div className={styles.loading}>
                <span>No pudimos cargar tu súper personalización. Revisa tu conexión.</span>
                <button type="button" className={styles.save} onClick={() => load()}>
                    Reintentar
                </button>
            </div>
        );
    }

    return (
        <div className={styles.panel}>
            <div className={styles.intro}>
                <p>
                    Mientras más te conozca la IA, mejores serán tus planes y respuestas. Esto es <strong>opcional</strong> y
                    no toca tus alergias ni condiciones médicas (esas viven en tu perfil). Puedes editarlo cuando quieras.
                </p>
            </div>

            <TagInput
                label="Lo que te encanta comer"
                hint="Tus platos y alimentos favoritos. La IA intentará incluirlos cuando encajen en tus macros."
                tags={sp.foodLikes}
                placeholder="Ej: pollo guisado, plátano, aguacate…"
                onChange={(v) => set('foodLikes', v)}
            />

            <TagInput
                label="Cocinas o estilos que prefieres"
                hint="Sesga el menú hacia estos estilos."
                tags={sp.cuisines}
                placeholder="Ej: criolla, italiana, asiática…"
                onChange={(v) => set('cuisines', v)}
            />

            <div className={styles.field}>
                <label className={styles.label}>Equipo de cocina que tienes</label>
                <p className={styles.hint}>La IA solo usará técnicas viables con tu equipo.</p>
                <div className={styles.chips}>
                    {EQUIPMENT_OPTIONS.map((item) => {
                        const active = sp.kitchenEquipment.includes(item);
                        return (
                            <button
                                key={item}
                                type="button"
                                className={`${styles.chip} ${active ? styles.chipActive : ''}`}
                                aria-pressed={active}
                                onClick={() => toggleEquip(item)}
                            >
                                {item}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className={styles.row}>
                <div className={styles.field}>
                    <label className={styles.label}>Restricción cultural / religiosa</label>
                    <select
                        className={styles.select}
                        value={sp.religiousRestriction || ''}
                        onChange={(e) => set('religiousRestriction', e.target.value)}
                    >
                        {RELIGION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                </div>
                <div className={styles.field}>
                    <label className={styles.label}>Nivel de cocina</label>
                    <select
                        className={styles.select}
                        value={sp.cookingSkill || ''}
                        onChange={(e) => set('cookingSkill', e.target.value)}
                    >
                        {SKILL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                </div>
            </div>

            {sp.religiousRestriction === 'otra' && (
                <div className={styles.field}>
                    <label className={styles.label}>Especifica tu restricción</label>
                    <p className={styles.hint}>La IA la respetará como exclusión obligatoria — nunca incluirá lo que prohíbe.</p>
                    <input
                        className={styles.select}
                        style={{ cursor: 'text' }}
                        type="text"
                        value={sp.religiousRestrictionOther || ''}
                        onChange={(e) => set('religiousRestrictionOther', e.target.value.slice(0, MAX_OTHER))}
                        maxLength={MAX_OTHER}
                        placeholder="Ej: sin carne los viernes, jainista (sin raíces), sin cerdo ni alcohol…"
                    />
                </div>
            )}

            <div className={styles.field}>
                <label className={styles.label}>Perfil de sabor</label>
                <p className={styles.hint}>Cuánto te gusta cada perfil. Ajusta la condimentación.</p>
                <div className={styles.flavors}>
                    {FLAVORS.map((f) => (
                        <div key={f.key} className={styles.flavor}>
                            <span>{f.label}</span>
                            <select
                                className={styles.select}
                                value={sp.flavorProfile?.[f.key] || ''}
                                onChange={(e) => setFlavor(f.key, e.target.value)}
                            >
                                {FLAVOR_LEVELS.map((lv) => <option key={lv.value} value={lv.value}>{lv.label}</option>)}
                            </select>
                        </div>
                    ))}
                </div>
            </div>

            <div className={styles.field}>
                <label className={styles.label}>Cuéntale lo que sea a la IA</label>
                <p className={styles.hint}>
                    Tu rutina, lo que odias, cómo comes, lo que te motiva… lo que quieras que recuerde.
                </p>
                <textarea
                    className={styles.textarea}
                    value={sp.freeText || ''}
                    onChange={(e) => set('freeText', e.target.value.slice(0, MAX_FREETEXT))}
                    maxLength={MAX_FREETEXT}
                    rows={5}
                    placeholder="Ej: Trabajo de noche y como a horas raras. Odio el cilantro. Cocino para mí y mi pareja…"
                />
                <div className={styles.counter}>{(sp.freeText || '').length}/{MAX_FREETEXT}</div>
            </div>

            <button type="button" className={styles.save} onClick={save} disabled={saving}>
                {saving && <Loader2 size={17} className={styles.spin} />}
                {saving ? 'Guardando…' : 'Guardar preferencias'}
            </button>
        </div>
    );
}
