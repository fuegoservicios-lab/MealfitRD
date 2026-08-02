// [P1-STAPLE-FOODS · 2026-08-02] Panel de "Mis básicos" en Ajustes → Tus gustos y preferencias.
// Edición POST-onboarding de los alimentos declarados en el paso QStapleFoods del wizard (o
// elegidos aquí por primera vez si el usuario saltó ese paso). Persiste en
// health_profile.staple_foods vía GET/PUT /api/user/preferences/staple-foods (atómico, I6/I7 —
// NO escritura directa a DB). Al guardar, sincroniza formData.stapleFoods para que la PRÓXIMA
// generación/swap de esta misma sesión ya lo use (mismo patrón que SuperPersonalizationPanel).
//
// A propósito SIN texto libre — es un widget de chips DEL CATÁLOGO REAL (igual que el paso del
// wizard): los básicos alimentan gates deterministas que matchean por alias exacto contra
// `master_ingredients`; un nombre inventado nunca haría match.
import { useState, useEffect, useCallback } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth } from '../../config/api';
import { useAssessment } from '../../context/AssessmentContext';
import { getCachedMasterList, setCachedMasterList } from '../../utils/pantryCache';
import styles from './SuperPersonalizationPanel.module.css';

const ENDPOINT = '/api/user/preferences/staple-foods';
const MAX_STAPLES = 8;

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default function StapleFoodsPanel({ onSaved }) {
    const { updateData } = useAssessment();
    const [staples, setStaples] = useState([]);
    const [masterList, setMasterList] = useState(() => getCachedMasterList() || []);
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    // [P2-SUPERPERS-FAIL-CLOSED pattern] fail-closed: una carga fallida NUNCA deja el panel
    // vacío-editable (guardar pisaría los básicos reales con []).
    const [loadFailed, setLoadFailed] = useState(false);

    const load = useCallback(async (attempt = 0) => {
        setLoading(true);
        setLoadFailed(false);
        let willRetry = false;
        try {
            const res = await fetchWithAuth(ENDPOINT);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setStaples(Array.isArray(data?.staple_foods) ? data.staple_foods : []);
        } catch {
            if (attempt < 1) {
                willRetry = true;
                setTimeout(() => load(attempt + 1), 800);
            } else {
                setLoadFailed(true);
                toast.error('No se pudieron cargar tus básicos.');
            }
        } finally {
            if (!willRetry) setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if ((getCachedMasterList() || []).length > 0) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const resp = await fetchWithAuth('/api/catalog');
                const json = resp?.ok ? await resp.json() : null;
                const items = json?.items || [];
                if (!cancelled && items.length) {
                    setMasterList(items);
                    setCachedMasterList(items);
                }
            } catch { /* fail-soft: sin catálogo el usuario no puede buscar, puede reintentar luego */ }
        })();
        return () => { cancelled = true; };
    }, []);

    const atMax = staples.length >= MAX_STAPLES;
    const q = norm(query.trim());
    const selectedLower = new Set(staples.map(norm));
    const results = q.length >= 2
        ? masterList.filter((m) => norm(m.name).includes(q) && !selectedLower.has(norm(m.name))).slice(0, 8)
        : [];

    const addStaple = (name) => {
        if (atMax || !name) return;
        setStaples((prev) => [...prev, name]);
        setQuery('');
    };
    const removeStaple = (name) => setStaples((prev) => prev.filter((s) => s !== name));

    const save = async () => {
        if (loading || loadFailed) {
            toast.error('Primero deben cargar tus básicos actuales — usa "Reintentar".');
            return;
        }
        setSaving(true);
        try {
            const res = await fetchWithAuth(ENDPOINT, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ staple_foods: staples }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => null);
                throw new Error(err?.detail || `HTTP ${res.status}`);
            }
            const data = await res.json();
            const saved = Array.isArray(data?.staple_foods) ? data.staple_foods : staples;
            setStaples(saved);
            // Sincroniza formData para que el plan/swap de ESTA sesión ya lo use.
            try { updateData('stapleFoods', saved); } catch { /* no-op */ }
            if (onSaved) onSaved(saved);
            toast.success('Básicos guardados. Tu próximo plan y tus swaps los usarán como ancla recurrente.');
        } catch (e) {
            toast.error(e?.message || 'No se pudo guardar. Intenta de nuevo.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className={styles.loading}>
                <Loader2 size={22} className={styles.spin} />
                <span>Cargando tus básicos…</span>
            </div>
        );
    }

    if (loadFailed) {
        return (
            <div className={styles.loading}>
                <span>No pudimos cargar tus básicos. Revisa tu conexión.</span>
                <button type="button" className={styles.save} onClick={() => load()}>
                    Reintentar
                </button>
            </div>
        );
    }

    return (
        <div className={styles.panel}>
            <div className={styles.field}>
                <label className={styles.label}>Mis básicos</label>
                <p className={styles.hint}>
                    Alimentos que comes de siempre — podrán repetirse entre días, y hasta el mismo
                    día si los cocinamos distinto (ej. huevo hervido en la mañana, huevo revuelto en
                    la noche), sin que eso cuente como falta de variedad. Máximo {MAX_STAPLES}.
                </p>

                <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
                    <Search size={15} style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={atMax ? `Máximo ${MAX_STAPLES} básicos` : 'Busca un alimento del catálogo…'}
                        aria-label="Buscar alimento para agregar a tus básicos"
                        disabled={atMax}
                        className={styles.select}
                        style={{ paddingLeft: '2.2rem', cursor: 'text', opacity: atMax ? 0.6 : 1 }}
                    />
                    {results.length > 0 && !atMax && (
                        <div role="listbox" aria-label="Resultados del catálogo" style={{
                            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 20,
                            background: 'var(--bg-card)', border: '1px solid var(--border)',
                            borderRadius: '0.75rem', overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                        }}>
                            {results.map((m) => (
                                <button key={m.id} type="button" role="option" aria-selected="false"
                                    onClick={() => addStaple(m.name)}
                                    style={{
                                        display: 'block', width: '100%', textAlign: 'left',
                                        padding: '0.6rem 0.9rem', background: 'none', border: 'none',
                                        cursor: 'pointer', color: 'var(--text-main)', fontSize: '0.9rem',
                                    }}>
                                    {m.name}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {staples.length === 0 ? (
                    <p className={styles.hint} style={{ marginTop: 0 }}>Aún no has elegido ningún básico.</p>
                ) : (
                    <div className={styles.tagBox} style={{ cursor: 'default' }}>
                        {staples.map((name) => (
                            <span key={name} className={styles.tag}>
                                {name}
                                <button type="button" aria-label={`Quitar ${name} de tus básicos`} onClick={() => removeStaple(name)}>
                                    <X size={13} />
                                </button>
                            </span>
                        ))}
                    </div>
                )}
                <div className={styles.counter}>{staples.length}/{MAX_STAPLES}</div>
            </div>

            <button type="button" className={styles.save} onClick={save} disabled={saving}>
                {saving && <Loader2 size={17} className={styles.spin} />}
                {saving ? 'Guardando…' : 'Guardar básicos'}
            </button>
        </div>
    );
}
