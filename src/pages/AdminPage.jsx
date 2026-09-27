// frontend/src/pages/AdminPage.jsx
// [P1-PLAN-LOTE-579 · 2026-09-27] Panel de administración, capa 1 (docs/superpowers/specs/2026-09-27-panel-admin-design.md).
// Pintor GENÉRICO: el servidor manda cada bloque con su título y sus filas ya redactadas (una métrica nueva es solo
// backend) y aquí solo se pintan. Es interno —solo el dueño, solo español—: los pocos textos fijos van con I18N-EXEMPT.
import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { fetchWithAuth } from '../config/api';
import styles from './AdminPage.module.css';

const RANGOS = [7, 30, 90];

function Bloque({ bloque }) {
    if (bloque.tipo === 'tabla') {
        return (
            <section className={styles.bloque}>
                <h2 className={styles.titulo}>{bloque.titulo}</h2>
                <div className={styles.tablaScroll}>
                    <table className={styles.tabla}>
                        <thead><tr>{bloque.columnas.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                        <tbody>
                            {bloque.filas.map((fila, i) => (
                                <tr key={i}>{fila.map((celda, j) => <td key={j}>{celda}</td>)}</tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        );
    }
    return (
        <section className={styles.bloque}>
            <h2 className={styles.titulo}>{bloque.titulo}</h2>
            {bloque.tipo === 'error'
                ? <p className={styles.error}>{bloque.error}</p>
                : (
                    <dl className={styles.kpis}>
                        {bloque.filas.map((f) => (
                            <div key={f.etiqueta} className={styles.kpi}>
                                <dt>{f.etiqueta}</dt>
                                <dd>{f.valor}</dd>
                            </div>
                        ))}
                    </dl>
                )}
        </section>
    );
}

export default function AdminPage() {
    const [dias, setDias] = useState(7);
    const [estado, setEstado] = useState('cargando');
    const [datos, setDatos] = useState(null);
    const [intento, setIntento] = useState(0);

    useEffect(() => {
        fetchWithAuth('/api/admin/yo').catch(() => {});
    }, []);

    useEffect(() => {
        let vivo = true;
        (async () => {
            try {
                const r = await fetchWithAuth(`/api/admin/metricas?dias=${dias}`);
                if (!vivo) return;
                if (r.status === 404 || r.status === 401) { setEstado('fuera'); return; }
                if (!r.ok) { setEstado('error'); return; }
                const cuerpo = await r.json();
                if (!vivo) return;
                setDatos(cuerpo);
                setEstado('listo');
            } catch {
                if (vivo) setEstado('error');
            }
        })();
        return () => { vivo = false; };
    }, [dias, intento]);

    const elegir = (d) => { setEstado('cargando'); setDias(d); };
    const reintentar = () => { setEstado('cargando'); setIntento((n) => n + 1); };

    if (estado === 'fuera') return <Navigate to="/dashboard" replace />;
    return (
        <main className={styles.pagina}>
            <header className={styles.cabecera}>
                {/* [I18N-EXEMPT: panel interno del dueño, solo español] */}
                <h1 className={styles.h1}>Panel de administración</h1>
                {/* [I18N-EXEMPT: panel interno del dueño, solo español] */}
                <Link to="/dashboard" className={styles.volver}>Volver a la app</Link>
            </header>
            {/* [I18N-EXEMPT: panel interno del dueño, solo español] */}
            <div className={styles.rangos} role="group" aria-label="Periodo">
                {RANGOS.map((d) => (
                    // [I18N-EXEMPT: panel interno del dueño, solo español]
                    <button key={d} type="button" className={d === dias ? styles.rangoActivo : styles.rango} onClick={() => elegir(d)}>{d} días</button>
                ))}
            </div>
            {estado === 'cargando' && (
                // [I18N-EXEMPT: panel interno del dueño, solo español]
                <p className={styles.estado}>Cargando…</p>
            )}
            {estado === 'error' && (
                <div className={styles.estado}>
                    {/* [I18N-EXEMPT: panel interno del dueño, solo español] */}
                    <p>No se pudieron cargar las métricas.</p>
                    {/* [I18N-EXEMPT: panel interno del dueño, solo español] */}
                    <button type="button" className={styles.rango} onClick={reintentar}>Reintentar</button>
                </div>
            )}
            {estado === 'listo' && datos && (
                <div className={styles.rejilla}>
                    {datos.bloques.map((b) => <Bloque key={b.id} bloque={b} />)}
                </div>
            )}
        </main>
    );
}
