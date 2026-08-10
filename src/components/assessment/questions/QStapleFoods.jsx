// [P1-STAPLE-FOODS · 2026-08-02] "Mis básicos" — feature aprobada por el owner: el usuario declara
// alimentos que come de siempre (máx 8, chips DEL CATÁLOGO REAL — a propósito sin texto libre, a
// diferencia de QDislikes/QAllergies: los básicos alimentan gates deterministas que matchean por
// alias exacto contra `master_ingredients`, así que texto libre inventado nunca haría match y
// frustraría al usuario en silencio). Paso OPCIONAL/skippeable del wizard (mismo patrón que
// QSupplements: NextButton NUNCA se deshabilita por falta de selección).
//
// Widget de búsqueda espejado de QPantryBuilder ("Buscador del catálogo verificado" — comentario
// original de ese archivo): reusa el cache singleton `pantryCache.js` (`getCachedMasterList` /
// `setCachedMasterList`, TTL 24h) para NO duplicar el fetch de `/api/catalog` si el usuario ya
// pasó por Nevera/QPantryBuilder en la misma sesión.
//
// Persistencia: SOLO en `formData.stapleFoods` (memoria + `mealfit_form`, NO sensible — ver
// AssessmentContext.jsx) durante el wizard, exactamente como dislikes/allergies. La copia DURABLE
// en `health_profile.staple_foods` (para que sobreviva a un browser distinto o storage limpio) se
// guarda explícitamente en Ajustes → "Mis básicos" (Settings.jsx), vía PUT
// /api/user/preferences/staple-foods — mismo split de responsabilidad que el resto del wizard.
import { useEffect, useMemo, useState } from 'react';
import { useAssessment } from '../../../context/AssessmentContext';
import { fetchWithAuth } from '../../../config/api';
import { Search, X } from 'lucide-react';
import { NextButton } from './NextButton';
import { getCachedMasterList, setCachedMasterList } from '../../../utils/pantryCache';

const STAPLE_FOODS_MAX = 8;
const MAX_RESULTS = 8;

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// [P1-STAPLE-SEARCH-RANK · 2026-08-09] Relevancia de un resultado (menor = mejor).
//
// Antes se filtraba con `includes` y se cortaba a 8 SIN ordenar, así que salían en
// el orden alfabético del catálogo: al escribir «hu» aparecían tres habichuelas y
// la clara de huevo POR ENCIMA de «Huevo». Los alimentos que contienen lo escrito
// en medio (le-chu-ga, pe-chu-ga, ha-bichu-elas) empataban con el que empieza por
// ahí. Y el corte iba ANTES del orden, así que con una búsqueda concurrida lo que
// el usuario tecleaba literalmente podía no aparecer.
//
// El desempate interior (rango 2) es lo que hace que «pav» encuentre «Pechuga de
// pavo» por encima de un alimento que solo lleve esas letras dentro de una palabra.
const rankOf = (name, q) => {
    const n = norm(name);
    if (n === q) return 0;                                          // exacto
    if (n.startsWith(q)) return 1;                                  // empieza por
    if (n.split(/[^a-z0-9]+/).some((w) => w.startsWith(q))) return 2; // palabra interior
    return 3;                                                       // lo contiene
};

export const QStapleFoods = ({ onManualAdvance }) => {
    const { formData, updateData } = useAssessment();
    const [masterList, setMasterList] = useState(() => getCachedMasterList() || []);
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState((getCachedMasterList() || []).length === 0);

    const staples = formData.stapleFoods || [];
    const atMax = staples.length >= STAPLE_FOODS_MAX;

    useEffect(() => {
        if ((getCachedMasterList() || []).length > 0) { setLoading(false); return undefined; }
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
            } catch {
                // fail-soft: el paso es opcional, sin catálogo el usuario simplemente
                // no puede buscar (puede seguir con "Siguiente" sin elegir nada).
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const q = norm(query.trim());
    const selectedLower = new Set(staples.map(norm));
    // El `.sort` de JS es estable, así que dentro de un mismo rango se preserva el
    // alfabético que ya trae el catálogo del backend. Ordenar va ANTES de cortar.
    const results = q.length >= 2
        ? masterList
            .filter(m => norm(m.name).includes(q) && !selectedLower.has(norm(m.name)))
            .map(m => ({ m, rank: rankOf(m.name, q) }))
            .sort((a, b) => a.rank - b.rank)
            .slice(0, MAX_RESULTS)
            .map(x => x.m)
        : [];

    // [P1-STAPLE-SEARCH-RANK · 2026-08-09] Básicos elegidos que el motor trata como
    // UNO SOLO. El rótulo lo calcula el backend desde su propio SSOT y viaja en el
    // catálogo (`staple_gate_label`) — el cliente no tiene ni debe tener su copia de
    // la tabla de alias. Ausente (catálogo viejo en caché, o alimento que no
    // participa del gate) ⇒ no se agrupa y no se avisa nada.
    const labelByName = useMemo(() => {
        const map = new Map();
        for (const it of masterList) {
            if (it?.name) map.set(norm(it.name), it.staple_gate_label || null);
        }
        return map;
    }, [masterList]);

    const collapsedGroups = useMemo(() => {
        const byLabel = new Map();
        for (const s of staples) {
            const label = labelByName.get(norm(s));
            if (!label) continue;
            if (!byLabel.has(label)) byLabel.set(label, []);
            byLabel.get(label).push(s);
        }
        return [...byLabel.values()].filter(g => g.length >= 2);
    }, [staples, labelByName]);

    const freeableSlots = collapsedGroups.reduce((acc, g) => acc + g.length - 1, 0);

    const addStaple = (name) => {
        if (atMax || !name) return;
        const next = [...staples, name];
        updateData('stapleFoods', next);
        setQuery('');
    };

    const removeStaple = (name) => {
        updateData('stapleFoods', staples.filter(s => s !== name));
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Estos alimentos podrán repetirse entre días — y hasta el mismo día si los cocinamos
                distinto (ej. huevo hervido en la mañana, huevo revuelto en la noche) — sin que eso
                cuente como falta de variedad. Totalmente opcional: puedes seguir sin elegir ninguno.
            </p>

            <div style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={atMax ? `Máximo ${STAPLE_FOODS_MAX} básicos` : 'Busca un alimento (huevo, pollo, arroz…)'}
                    aria-label="Buscar alimento del catálogo para agregar a tus básicos"
                    disabled={atMax}
                    style={{
                        width: '100%', padding: '0.85rem 1rem 0.85rem 2.4rem',
                        borderRadius: '0.9rem', border: '1px solid var(--border)',
                        background: 'var(--bg-card)', color: 'var(--text-main)', fontSize: '0.95rem',
                        opacity: atMax ? 0.6 : 1,
                    }}
                />
                {results.length > 0 && !atMax && (
                    <div role="listbox" aria-label="Resultados del catálogo" style={{
                        position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 20,
                        background: 'var(--bg-card)', border: '1px solid var(--border)',
                        borderRadius: '0.9rem', overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                    }}>
                        {results.map(m => (
                            <button key={m.id} type="button" role="option" aria-selected="false"
                                onClick={() => addStaple(m.name)}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    width: '100%', padding: '0.65rem 0.9rem', background: 'none',
                                    border: 'none', cursor: 'pointer', color: 'var(--text-main)', fontSize: '0.9rem',
                                }}>
                                <span>{m.name}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {loading ? (
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Cargando catálogo…</p>
            ) : staples.length === 0 ? (
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>
                    Aún no has elegido ningún básico.
                </p>
            ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {staples.map(name => (
                        <span key={name} style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                            padding: '0.45rem 0.5rem 0.45rem 0.9rem', borderRadius: '999px',
                            border: '1px solid var(--primary)', background: 'rgba(37, 99, 235, 0.12)',
                            color: 'var(--text-main)', fontSize: '0.85rem', fontWeight: 600,
                        }}>
                            {name}
                            <button type="button" aria-label={`Quitar ${name} de tus básicos`}
                                onClick={() => removeStaple(name)}
                                style={{
                                    display: 'inline-flex', background: 'none', border: 'none',
                                    cursor: 'pointer', color: 'var(--text-muted)', padding: 2,
                                }}>
                                <X size={14} />
                            </button>
                        </span>
                    ))}
                </div>
            )}

            {collapsedGroups.length > 0 && (
                <div role="status" style={{
                    margin: 0, padding: '0.7rem 0.9rem', borderRadius: '0.75rem',
                    border: '1px dashed var(--border)', color: 'var(--text-muted)', fontSize: '0.83rem',
                }}>
                    {collapsedGroups.map((g) => (
                        <p key={g.join('|')} style={{ margin: '0 0 0.35rem' }}>
                            Para la variedad, {g.map((n) => `«${n}»`).join(' y ')} cuentan como
                            {' '}<strong>el mismo alimento</strong>: con elegir uno basta.
                        </p>
                    ))}
                    <p style={{ margin: 0 }}>
                        Puedes quitar {freeableSlots === 1 ? 'uno' : freeableSlots} y dejar
                        {' '}{freeableSlots === 1 ? 'ese espacio' : 'esos espacios'} para otro alimento.
                        No es un error — si los dejas, funciona igual.
                    </p>
                </div>
            )}

            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.78rem', textAlign: 'right' }}>
                {staples.length}/{STAPLE_FOODS_MAX}
            </p>

            <NextButton onClick={onManualAdvance} disabled={false} label="Siguiente" />
        </div>
    );
};
