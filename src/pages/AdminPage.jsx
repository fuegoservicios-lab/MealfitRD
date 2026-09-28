// frontend/src/pages/AdminPage.jsx
// [P1-PLAN-LOTE-579 · 2026-09-27] Panel de administración, capa 1 (docs/superpowers/specs/2026-09-27-panel-admin-design.md).
// Pintor GENÉRICO: el servidor manda cada bloque con su título y sus filas ya redactadas (una métrica nueva es solo
// backend) y aquí solo se pintan. Es interno —solo el dueño, solo español—: los textos fijos viven en TEXTOS, con su
// marca de exención de i18n.
// [P1-PLAN-LOTE-621 · 2026-09-27] Se lee de un vistazo: las filas `destacado` van en grande arriba del bloque, las de
// `nivel` 1 (o con la marca vieja «· ») sangradas, un cero se apaga, las tablas ocupan el ancho con los números a la
// derecha y la proporción de `barras`, la `nota` del bloque va debajo y la cabecera dice cuándo se cargó.
import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { fetchWithAuth } from '../config/api';
import styles from './AdminPage.module.css';

const RANGOS = [7, 30, 90];

// [I18N-EXEMPT: panel interno del dueño, solo español]
const TEXTOS = {
    titulo: 'Panel de administración',
    volver: 'Volver a la app',
    periodo: 'Periodo',
    dias: (d) => `${d} días`,
    cargando: 'Cargando…',
    errorCarga: 'No se pudieron cargar las métricas.',
    reintentar: 'Reintentar',
    actualizar: 'Actualizar',
    actualizado: (hora) => `Actualizado a las ${hora}`,
    principales: 'Cifras principales',
};

const MARCA_SUBFILA = /^·\s*/;
const CERO = /^(0|0 %|—|US\$0\.00)$/;
const NUMERICA = /^(—|[\d.,]+( %)?|US\$[\d.,]+)$/;
const FECHA = /^\d{4}-\d{2}-\d{2}/;
// Una columna de texto con alguna celda más larga que esto pide ancho mínimo: en el móvil no se parte en seis líneas.
const TEXTO_LARGO = 30;

// Con más filas visibles que esto, el bloque ocupa el ancho y reparte su lista en columnas.
const FILAS_PARA_ANCHO = 8;

const esCero = (v) => CERO.test(String(v ?? '').trim());
const celdaNumerica = (v) => NUMERICA.test(String(v ?? '').trim());
const esSubfila = (f) => f.nivel === 1 || MARCA_SUBFILA.test(String(f.etiqueta));

/** Filas no destacadas en grupos «total + subfilas». Bajo un total en cero sus subfilas no informan nada: fuera. */
function gruposDe(filas) {
    const grupos = [];
    for (const f of filas) {
        if (f.destacado) continue;
        if (esSubfila(f) && grupos.length > 0) grupos[grupos.length - 1].hijas.push(f);
        else if (esSubfila(f)) grupos.push({ padre: null, hijas: [f] });
        else grupos.push({ padre: f, hijas: [] });
    }
    return grupos.map((g) => (g.padre && esCero(g.padre.valor) ? { ...g, hijas: [] } : g));
}

const filasVisibles = (bloque) => gruposDe(bloque.filas).reduce((n, g) => n + (g.padre ? 1 : 0) + g.hijas.length, 0);
// Ancho: las tablas, lo que el servidor pida (`ancho`) y un bloque de muchas filas.
const esAncho = (bloque) => bloque.tipo === 'tabla' || bloque.ancho === true
    || (bloque.tipo === 'kpis' && filasVisibles(bloque) > FILAS_PARA_ANCHO);

function Fila({ fila }) {
    const subfila = esSubfila(fila);
    const etiqueta = String(fila.etiqueta).replace(MARCA_SUBFILA, '');
    const cero = esCero(fila.valor);
    return (
        <div className={subfila ? `${styles.kpi} ${styles.subfila}` : styles.kpi} data-nivel={subfila ? '1' : '0'}>
            <span className={styles.etiqueta}>{etiqueta}</span>
            <span className={cero ? `${styles.valor} ${styles.valorCero}` : styles.valor} data-cero={cero ? 'true' : undefined}>
                {fila.valor}
            </span>
        </div>
    );
}

function BloqueKpis({ bloque, ancho }) {
    const destacados = bloque.filas.filter((f) => f.destacado);
    const grupos = gruposDe(bloque.filas);
    return (
        <>
            {destacados.length > 0 && (
                <ul className={styles.destacados} aria-label={TEXTOS.principales}>
                    {destacados.map((f, i) => (
                        <li key={i} className={styles.destacado}>
                            <span className={esCero(f.valor) ? `${styles.destacadoValor} ${styles.valorCero}` : styles.destacadoValor}>{f.valor}</span>
                            <span className={styles.destacadoEtiqueta}>{f.etiqueta}</span>
                        </li>
                    ))}
                </ul>
            )}
            {grupos.length > 0 && (
                <div className={ancho ? `${styles.kpis} ${styles.kpisAncho}` : styles.kpis}>
                    {grupos.map((g, i) => (
                        <div key={i} className={styles.grupo}>
                            {g.padre && <Fila fila={g.padre} />}
                            {g.hijas.map((f, j) => <Fila key={j} fila={f} />)}
                        </div>
                    ))}
                </div>
            )}
        </>
    );
}

function BloqueTabla({ bloque }) {
    // Una columna es numérica si todas sus celdas lo son: se alinea a la derecha y no se parte.
    const numericas = bloque.columnas.map((_, j) => bloque.filas.length > 0 && bloque.filas.every((f) => celdaNumerica(f[j])));
    const largas = bloque.columnas.map((_, j) => !numericas[j] && bloque.filas.some((f) => String(f[j] ?? '').length > TEXTO_LARGO));
    return (
        <div className={styles.tablaScroll}>
            <table className={styles.tabla} style={{ '--columnas': bloque.columnas.length }}>
                <thead>
                    <tr>{bloque.columnas.map((c, j) => <th key={c} className={numericas[j] ? styles.num : undefined}>{c}</th>)}</tr>
                </thead>
                <tbody>
                    {bloque.filas.map((fila, i) => (
                        <tr key={i}>
                            {fila.map((celda, j) => (
                                <td
                                    key={j}
                                    className={numericas[j] ? styles.num : (FECHA.test(String(celda)) ? styles.sinPartir : undefined)}
                                    data-numerica={numericas[j] ? 'true' : undefined}
                                >
                                    {largas[j] ? <div className={styles.textoLargo} data-texto-largo="">{celda}</div> : celda}
                                    {j === 0 && Array.isArray(bloque.barras) && typeof bloque.barras[i] === 'number' && (
                                        <span
                                            className={styles.barra}
                                            data-barra=""
                                            aria-hidden="true"
                                            style={{ width: `${Math.max(0, Math.min(100, Math.round(bloque.barras[i] * 100)))}%` }}
                                        />
                                    )}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function Bloque({ bloque }) {
    const ancho = esAncho(bloque);
    return (
        <section className={ancho ? `${styles.bloque} ${styles.bloqueAncho}` : styles.bloque} data-ancho={ancho ? 'completo' : undefined}>
            <h2 className={styles.titulo}>{bloque.titulo}</h2>
            {bloque.tipo === 'error' && <p className={styles.error}>{bloque.error}</p>}
            {bloque.tipo === 'tabla' && <BloqueTabla bloque={bloque} />}
            {bloque.tipo === 'kpis' && <BloqueKpis bloque={bloque} ancho={ancho} />}
            {bloque.nota && <p className={styles.nota}>{bloque.nota}</p>}
        </section>
    );
}

const horaDe = (iso) => {
    const d = iso ? new Date(iso) : new Date();
    return Number.isNaN(d.getTime()) ? '' : `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
};

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

    // El periodo que ya está activo no relanzaría el efecto: sin este corte, «Cargando…» se quedaba para siempre.
    const elegir = (d) => { if (d === dias) return; setEstado('cargando'); setDias(d); };
    const recargar = () => { setEstado('cargando'); setIntento((n) => n + 1); };

    if (estado === 'fuera') return <Navigate to="/dashboard" replace />;
    return (
        <main className={styles.pagina}>
            <header className={styles.cabecera}>
                <div>
                    <h1 className={styles.h1}>{TEXTOS.titulo}</h1>
                    {estado === 'listo' && datos && <p className={styles.sub}>{TEXTOS.actualizado(horaDe(datos.generado))}</p>}
                </div>
                <Link to="/dashboard" className={styles.volver}>{TEXTOS.volver}</Link>
            </header>
            <div className={styles.barraHerramientas}>
                <div className={styles.rangos} role="group" aria-label={TEXTOS.periodo}>
                    {RANGOS.map((d) => (
                        <button key={d} type="button" className={d === dias ? styles.rangoActivo : styles.rango} onClick={() => elegir(d)}>
                            {TEXTOS.dias(d)}
                        </button>
                    ))}
                </div>
                <button type="button" className={styles.rango} onClick={recargar} disabled={estado === 'cargando'}>{TEXTOS.actualizar}</button>
            </div>
            {estado === 'cargando' && <p className={styles.estado}>{TEXTOS.cargando}</p>}
            {estado === 'error' && (
                <div className={styles.estado}>
                    <p>{TEXTOS.errorCarga}</p>
                    <button type="button" className={styles.rango} onClick={recargar}>{TEXTOS.reintentar}</button>
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
