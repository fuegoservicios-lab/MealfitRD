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
import { useState, useEffect, useCallback, useId } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth } from '../../config/api';
import { useAssessment } from '../../context/AssessmentContext';
import useAutoguardado, { claveEstable, enviarAlIrse } from '../../hooks/useAutoguardado';
import { useLatestRef } from '../../hooks/useLatestRef';
import { getCachedMasterList, setCachedMasterList } from '../../utils/pantryCache';
// [P1-PLAN-LOTE-225] El alimento se PINTA en el idioma del usuario y se BUSCA en los cinco; se guarda el canónico.
import { nombreDeFila, nombreDelAlimento, formasDeBuscar } from '../../utils/nombresDeAlimentos';
import { useT } from '../../i18n';
import styles from './SuperPersonalizationPanel.module.css';

const ENDPOINT = '/api/user/preferences/staple-foods';
const MAX_STAPLES = 8;
const MAX_RESULTS = 8;

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/* [P1-PLAN-LOTE-718 · 2026-09-28] Portado de `QStapleFoods.jsx` (P1-STAPLE-SEARCH-RANK · 2026-08-09),
   que no lo exporta. Relevancia de un resultado, menor = mejor: exacto, empieza por, palabra
   interior, lo contiene. Aquí se filtraba con `includes` y se cortaba a 8 SIN ordenar, así que al
   escribir «hu» salían las habichuelas por encima de «Huevo» — el defecto que el asistente cerró
   en agosto y este panel seguía teniendo. Si cambias la regla, cámbiala en los dos (o muévela a
   un util compartido cuando se pueda tocar el asistente). */
const rankOf = (name, q) => {
    const n = norm(name);
    if (n === q) return 0;                                          // exacto
    if (n.startsWith(q)) return 1;                                  // empieza por
    if (n.split(/[^a-z0-9]+/).some((w) => w.startsWith(q))) return 2; // palabra interior
    return 3;                                                       // lo contiene
};

/** [P1-PLAN-LOTE-718] Las anclas del asistente (`formData.stapleAnchors`) que siguen teniendo su básico. */
const anclasDe = (anclas, lista) => {
    const vivos = new Set((lista || []).map(norm));
    return (Array.isArray(anclas) ? anclas : []).filter((a) => a && vivos.has(norm(a.name)));
};

export default function StapleFoodsPanel({ onSaved, onEstado }) {
    const t = useT();
    const { updateData, formData } = useAssessment();
    // [P1-PLAN-LOTE-718 · 2026-09-28] Por ref: `updateData` cambia de identidad en cada render del
    // proveedor y `load` no puede depender de ella (su efecto de montaje se re-dispararía).
    const updateDataRef = useLatestRef(updateData);
    const formDataRef = useLatestRef(formData);
    const idTitulo = useId();
    const idPista = useId();
    const [staples, setStaples] = useState([]);
    const [masterList, setMasterList] = useState(() => getCachedMasterList() || []);
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(true);
    // [P2-SUPERPERS-FAIL-CLOSED pattern] fail-closed: una carga fallida NUNCA deja el panel
    // vacío-editable (guardar pisaría los básicos reales con []).
    const [loadFailed, setLoadFailed] = useState(false);

    /* [P1-PLAN-LOTE-718 · 2026-09-28] Las copias de `formData` al día con una lista de básicos.
       Son DOS claves y las dos existen: `stapleFoods` (la del asistente, la que la renovación
       del plan manda como `staple_foods` — AssessmentContext) y `staple_foods` (la que hidrata
       del health_profile). Actualizar solo una dejaba la otra vieja, y la vieja volvía al
       servidor en la siguiente renovación. Y las ANCLAS del asistente (`stapleAnchors`) se podan
       a la vez: el backend AÑADE a los básicos el nombre de cada ancla
       (`plan_policy.compile_requested`), así que un ancla huérfana resucitaba el básico que el
       usuario acababa de quitar. Solo se escribe lo que difiere: `updateData` marca la clave
       como editada. */
    const sincronizarFormulario = useCallback((lista) => {
        const fd = formDataRef.current || {};
        const escribir = updateDataRef.current;
        if (typeof escribir !== 'function') return;
        try {
            if (claveEstable(fd.stapleFoods ?? null) !== claveEstable(lista)) escribir('stapleFoods', lista);
            if (claveEstable(fd.staple_foods ?? null) !== claveEstable(lista)) escribir('staple_foods', lista);
            const anclas = Array.isArray(fd.stapleAnchors) ? fd.stapleAnchors : [];
            const podadas = anclasDe(anclas, lista);
            if (podadas.length !== anclas.length) escribir('stapleAnchors', podadas);
        } catch { /* no-op: el panel sigue siendo la fuente al guardar */ }
    }, [formDataRef, updateDataRef]);

    const load = useCallback(async (attempt = 0) => {
        setLoading(true);
        setLoadFailed(false);
        let willRetry = false;
        try {
            const res = await fetchWithAuth(ENDPOINT);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const frescos = Array.isArray(data?.staple_foods) ? data.staple_foods : [];
            setStaples(frescos);
            sincronizarFormulario(frescos);
        } catch {
            if (attempt < 1) {
                willRetry = true;
                setTimeout(() => load(attempt + 1), 800);
            } else {
                setLoadFailed(true);
                toast.error(t('No se pudieron cargar tus básicos.'));
            }
        } finally {
            if (!willRetry) setLoading(false);
        }
        // `t` es referencialmente estable (el motor devuelve siempre la misma
        // función); va en las deps solo para no dejar el hook incompleto.
    }, [t, sincronizarFormulario]);

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
    // [P1-PLAN-LOTE-718] Ordenar va ANTES de cortar (P1-STAPLE-SEARCH-RANK): el `.sort` de JS es
    // estable, así que dentro de un mismo rango se conserva el alfabético del catálogo.
    const results = q.length >= 2
        ? masterList
            .filter((m) => formasDeBuscar(m).some((f) => norm(f).includes(q)) && !selectedLower.has(norm(m.name)))
            .map((m) => ({
                m,
                rank: norm(nombreDeFila(m)).includes(q)
                    ? rankOf(nombreDeFila(m), q)
                    : Math.min(...formasDeBuscar(m).filter((f) => norm(f).includes(q)).map((f) => rankOf(f, q))) + 0.5,
            }))
            .sort((a, b) => a.rank - b.rank)
            .slice(0, MAX_RESULTS)
            .map((x) => x.m)
        : [];

    const addStaple = (name) => {
        if (atMax || !name) return;
        setStaples((prev) => [...prev, name]);
        setQuery('');
    };
    const removeStaple = (name) => {
        setStaples((prev) => prev.filter((s) => s !== name));
        // [P1-PLAN-LOTE-718 · 2026-09-28] Igual que el asistente (`QStapleFoods.removeStaple`): quitar
        // un básico quita su ancla. Sin esto el ancla sobrevivía en `formData` y el backend volvía a
        // meter el básico en el plan.
        const anclas = Array.isArray(formDataRef.current?.stapleAnchors) ? formDataRef.current.stapleAnchors : [];
        if (anclas.some((a) => a && norm(a.name) === norm(name))) {
            try { updateDataRef.current('stapleAnchors', anclas.filter((a) => a && norm(a.name) !== norm(name))); } catch { /* no-op */ }
        }
    };

    /* [P1-SETTINGS-AUTOSAVE · 2026-08-11] Este panel ya no tiene botón: se guarda solo.
       Ver `hooks/useAutoguardado.js` para el porqué de las tres velocidades.

       Devuelve el eco del servidor A PROPÓSITO. Este panel adopta en su estado la lista
       que el backend responde (normaliza nombres), así que si la base del autoguardado
       se quedara con lo ENVIADO, el diff siguiente vería una diferencia que no existe y
       se llamaría a sí mismo. Devolviéndolo, base y estado se mueven juntos. */
    const guardar = useCallback(async ({ staples: lista }, opciones = {}) => {
        const init = {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ staple_foods: lista }),
        };
        // [P1-PLAN-LOTE-718] Al irse la página, el PUT sale en ESTE tic (ver `enviarAlIrse`).
        const res = opciones.keepalive ? await enviarAlIrse(ENDPOINT, init) : await fetchWithAuth(ENDPOINT, init);
        if (!res.ok) {
            const err = await res.json().catch(() => null);
            throw new Error(err?.detail || `HTTP ${res.status}`);
        }
        const data = await res.json();
        const saved = Array.isArray(data?.staple_foods) ? data.staple_foods : lista;
        // [P1-PLAN-LOTE-718 · 2026-09-28] El eco se adopta SOLO si la lista no cambió mientras el PUT
        // viajaba. Antes `setStaples(saved)` a secas pisaba el chip añadido durante el guardado: se
        // veía un instante y desaparecía (y como la base se movía al eco, ni siquiera se reintentaba).
        // Si cambió, se queda lo de la pantalla y el autoguardado manda la diferencia a continuación.
        setStaples((prev) => (claveEstable(prev) === claveEstable(lista) ? saved : prev));
        // Sincroniza formData para que el plan/swap de ESTA sesión ya lo use.
        sincronizarFormulario(saved);
        if (onSaved) onSaved(saved);
        return { staples: saved };
    }, [onSaved, sincronizarFormulario]);

    /* El toast de éxito se retira: con autoguardado saltaría cada vez que tocas un
       básico y el aviso pasaría de informar a estorbar. Lo sustituye el acuse
       permanente de la cabecera, que dice lo mismo sin interrumpir. El de ERROR se
       queda: eso sí hay que interrumpirlo. */
    const { estado } = useAutoguardado({
        valor: { staples },
        guardar,
        habilitado: !loading && !loadFailed,
        instantaneos: ['staples'],
        onEstado,
    });

    useEffect(() => { if (estado === 'error') toast.error(t('No se pudieron guardar tus básicos.')); }, [estado, t]);

    if (loading) {
        return (
            <div className={styles.loading} role="status">
                <Loader2 size={22} className={styles.spin} aria-hidden="true" />
                <span>{t('Cargando tus básicos…')}</span>
            </div>
        );
    }

    if (loadFailed) {
        return (
            <div className={styles.loading}>
                <span role="alert">{t('No pudimos cargar tus básicos. Revisa tu conexión.')}</span>
                <button type="button" className={styles.save} onClick={() => load()}>
                    {t('Reintentar')}
                </button>
            </div>
        );
    }

    return (
        <div className={styles.panel}>
            {/* [P1-PLAN-LOTE-718 · 2026-09-28] «Mis básicos» era un `<label>` sin control: es el nombre
                del GRUPO (buscador + chips), no de un campo. */}
            <div className={styles.field} role="group" aria-labelledby={idTitulo} aria-describedby={idPista}>
                <span className={styles.label} id={idTitulo}>{t('Mis básicos')}</span>
                <p className={styles.hint} id={idPista}>
                    {t('Alimentos que comes de siempre — podrán repetirse entre días, y hasta el mismo día si los cocinamos distinto (ej. huevo hervido en la mañana, huevo revuelto en la noche), sin que eso cuente como falta de variedad. Máximo {max}.', { max: MAX_STAPLES })}
                </p>

                <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
                    <Search size={15} aria-hidden="true" style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={atMax ? t('Máximo {max} básicos', { max: MAX_STAPLES }) : t('Busca un alimento del catálogo…')}
                        aria-label={t('Buscar alimento para agregar a tus básicos')}
                        disabled={atMax}
                        className={styles.select}
                        style={{ paddingLeft: '2.2rem', cursor: 'text', opacity: atMax ? 0.6 : 1 }}
                    />
                    {results.length > 0 && !atMax && (
                        <div role="listbox" aria-label={t('Resultados del catálogo')} style={{
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
                                    {nombreDeFila(m)}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {staples.length === 0 ? (
                    <p className={styles.hint} style={{ marginTop: 0 }}>{t('Aún no has elegido ningún básico.')}</p>
                ) : (
                    <div className={styles.tagBox} style={{ cursor: 'default' }}>
                        {staples.map((name) => (
                            <span key={name} className={styles.tag}>
                                {nombreDelAlimento(name)}
                                {/* `name` NO se traduce: es el nombre del alimento tal como vive
                                    en `master_ingredients` — el SSOT del motor clínico. */}
                                <button type="button" aria-label={t('Quitar {alimento} de tus básicos', { alimento: nombreDelAlimento(name) })} onClick={() => removeStaple(name)}>
                                    <X size={13} aria-hidden="true" />
                                </button>
                            </span>
                        ))}
                    </div>
                )}
                <div className={styles.counter}>{staples.length}/{MAX_STAPLES}</div>
            </div>

        </div>
    );
}
