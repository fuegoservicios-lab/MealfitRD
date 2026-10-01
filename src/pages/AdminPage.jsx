// frontend/src/pages/AdminPage.jsx
// [P1-PLAN-LOTE-579 · 2026-09-27] Panel de administración, capa 1 (docs/superpowers/specs/2026-09-27-panel-admin-design.md).
// Pintor GENÉRICO: el servidor manda cada bloque con su título y sus filas ya redactadas (una métrica nueva es solo
// backend) y aquí solo se pintan. Es interno —solo el dueño, solo español—: los textos fijos viven en TEXTOS, con su
// marca de exención de i18n.
// [P1-PLAN-LOTE-621 · 2026-09-27] Se lee de un vistazo: las filas `destacado` van en grande arriba del bloque, las de
// `nivel` 1 (o con la marca vieja «· ») sangradas, un cero se apaga, las tablas ocupan el ancho con los números a la
// derecha y la proporción de `barras`, la `nota` del bloque va debajo y la cabecera dice cuándo se cargó.
// [P1-PLAN-LOTE-638 · 2026-09-28] El dueño: «se ve feo y poco entendible». Los bloques llegan con `seccion` (Resumen →
// Requiere atención → Usuarios → Producto → Costes → Calidad) y el pintor abre un título por sección; tipos nuevos:
// `resumen` (la franja de arriba: cifra, cambio frente al periodo anterior con su tono y qué significa), `avisos`
// (alertas por tipo con su gravedad), `serie` (barras por día o semana) y `embudo`. Las filas pueden traer `ayuda`.
// Los títulos dejan las MAYÚSCULAS espaciadas y las cifras destacadas dejan de ser cajas dentro de cajas.
// [P1-PLAN-LOTE-770 · 2026-09-28] El dueño: «cuando paso de 7 a 30 parece de repente». La pastilla del periodo se
// desliza, los datos viejos se quedan atenuados mientras llegan los nuevos (antes la página entera se cambiaba por
// «Cargando…») y los nuevos entran con un fundido; «Volver a la app» es un botón. Sin animación si el sistema lo pide.
import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { fetchWithAuth } from '../config/api';
import AdminAjustesResumen from './AdminAjustesResumen';
import AdminCuentas from './AdminCuentas';
import styles from './AdminPage.module.css';
import { AdminNavigationProvider, useAdminLoading, useAdminNavigationState } from '../hooks/useAdminNavigation';

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
    actualizando: 'Actualizando…',
    errorRefresco: 'No se pudo actualizar; sigues viendo los datos anteriores.',
    actualizar: 'Actualizar',
    actualizado: (hora) => `Actualizado a las ${hora}`,
    principales: 'Cifras principales',
    nivel: { critico: 'Crítico', aviso: 'Revisar', info: 'Informativo' },
    secciones: 'Secciones del panel',
    metricas: 'Métricas',
    cuentas: 'Cuentas',
};

const MARCA_SUBFILA = /^·\s*/;
const CERO = /^(0|0 %|—|US\$0\.00)$/;
const NUMERICA = /^(—|[\d.,]+( %)?|US\$[\d.,]+)$/;
const FECHA = /^\d{4}-\d{2}-\d{2}/;
// Una columna de texto con alguna celda más larga que esto pide ancho mínimo: en el móvil no se parte en seis líneas.
const TEXTO_LARGO = 30;

// Con más filas visibles que esto, el bloque ocupa el ancho y reparte su lista en columnas.
const FILAS_PARA_ANCHO = 8;
// Una serie con más barras que esto rotula una de cada N (las demás llevan su cifra en el tooltip).
const ROTULOS_MAX = 8;
const TONOS = new Set(['bueno', 'malo', 'aviso', 'neutro']);
const NIVELES = new Set(['critico', 'aviso', 'info']);

const esCero = (v) => CERO.test(String(v ?? '').trim());
const celdaNumerica = (v) => NUMERICA.test(String(v ?? '').trim());
const esSubfila = (f) => f.nivel === 1 || MARCA_SUBFILA.test(String(f.etiqueta));
const tonoDe = (t) => (TONOS.has(t) ? t : 'neutro');
const nivelDe = (n) => (NIVELES.has(n) ? n : 'info');

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
// Ancho: las tablas, las series, lo que el servidor pida (`ancho`) y un bloque de muchas filas.
const esAncho = (bloque) => bloque.tipo === 'tabla' || bloque.tipo === 'serie' || bloque.tipo === 'avisos'
    || bloque.ancho === true || (bloque.tipo === 'kpis' && filasVisibles(bloque) > FILAS_PARA_ANCHO);

/** Bloques consecutivos con la misma `seccion` van juntos; sin `seccion`, un grupo sin título. */
function seccionesDe(bloques) {
    const secciones = [];
    for (const b of bloques) {
        const nombre = b.seccion || null;
        const ultima = secciones[secciones.length - 1];
        if (ultima && ultima.nombre === nombre) ultima.bloques.push(b);
        else secciones.push({ nombre, bloques: [b] });
    }
    // Un bloque de cifras que se ensancha solo por tener muchas filas pasa al final de su sección: en medio, dejaba
    // sola en su fila a la tarjeta de antes (Coach a todo el ancho con cuatro filas). Las gráficas y tablas no se mueven.
    const alFinal = (b) => b.tipo === 'kpis' && esAncho(b);
    return secciones.map((s) => ({ ...s, bloques: [...s.bloques.filter((b) => !alFinal(b)), ...s.bloques.filter(alFinal)] }));
}

function Fila({ fila }) {
    const subfila = esSubfila(fila);
    const etiqueta = String(fila.etiqueta).replace(MARCA_SUBFILA, '');
    const cero = esCero(fila.valor);
    return (
        <div className={subfila ? `${styles.kpi} ${styles.subfila}` : styles.kpi} data-nivel={subfila ? '1' : '0'}>
            <span className={styles.etiqueta}>
                {etiqueta}
                {fila.ayuda && <span className={styles.ayuda}>{fila.ayuda}</span>}
            </span>
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

/** La franja de arriba: cuatro cifras en una banda, cada una con su cambio y qué significa. */
function BloqueResumen({ bloque }) {
    return (
        <ul className={styles.resumen} aria-label={bloque.titulo}>
            {(bloque.tarjetas || []).map((t, i) => (
                <li key={i} className={styles.resumenCelda} data-tono={tonoDe(t.tono)}>
                    <span className={styles.resumenEtiqueta}>{t.etiqueta}</span>
                    <span className={styles.resumenValor}>
                        {t.tono && t.tono !== 'neutro' && !t.cambio && <span className={styles.punto} aria-hidden="true" />}
                        {t.valor}
                    </span>
                    {t.cambio && <span className={styles.resumenCambio}>{t.cambio}</span>}
                    {t.ayuda && <span className={styles.resumenAyuda}>{t.ayuda}</span>}
                </li>
            ))}
        </ul>
    );
}

function BloqueAvisos({ bloque }) {
    const items = bloque.items || [];
    if (items.length === 0) return <p className={styles.vacio}>{bloque.vacio}</p>;
    return (
        <ul className={styles.avisos}>
            {items.map((a, i) => {
                const nivel = nivelDe(a.nivel);
                return (
                    <li key={i} className={styles.aviso} data-nivel-aviso={nivel}>
                        <span className={styles.avisoNivel}>{TEXTOS.nivel[nivel]}</span>
                        <span className={styles.avisoTexto}>
                            <span className={styles.avisoTitulo}>{a.titulo}</span>
                            {a.detalle && <span className={styles.avisoDetalle}>{a.detalle}</span>}
                        </span>
                        <span className={styles.avisoValor}>{a.valor}</span>
                    </li>
                );
            })}
        </ul>
    );
}

function BloqueSerie({ bloque }) {
    const puntos = bloque.puntos || [];
    const max = Math.max(0, ...puntos.map((p) => Number(p.valor) || 0));
    const paso = Math.ceil(puntos.length / ROTULOS_MAX) || 1;
    const conCifra = puntos.length <= 14;
    return (
        <div className={styles.serie} role="list" style={{ '--barras': puntos.length }}>
            {puntos.map((p, i) => {
                const v = Number(p.valor) || 0;
                const alto = max > 0 ? Math.round((v / max) * 100) : 0;
                const rotulo = i % paso === 0 || i === puntos.length - 1;
                return (
                    <div key={i} className={styles.serieCol} role="listitem" aria-label={`${p.etiqueta}: ${p.texto}`} title={`${p.etiqueta}: ${p.texto}`}>
                        <span className={styles.serieCifra} data-cero={v === 0 ? 'true' : undefined}>{conCifra ? p.texto : ''}</span>
                        <span className={styles.serieCarril}>
                            <span className={v === 0 ? `${styles.serieBarra} ${styles.serieBarraCero}` : styles.serieBarra} data-serie-barra="" style={{ height: `${alto}%` }} />
                        </span>
                        <span className={styles.serieRotulo}>{rotulo ? p.etiqueta : ''}</span>
                    </div>
                );
            })}
        </div>
    );
}

function BloqueEmbudo({ bloque }) {
    return (
        <ol className={styles.embudo}>
            {(bloque.pasos || []).map((p, i) => (
                <li key={i} className={styles.paso}>
                    <span className={styles.pasoEtiqueta}>{p.etiqueta}</span>
                    <span className={styles.pasoCifras}><strong>{p.valor}</strong> <span className={styles.pasoPct}>{p.texto}</span></span>
                    <span className={styles.pasoCarril} aria-hidden="true">
                        <span className={styles.pasoBarra} data-paso-barra="" style={{ width: `${Math.max(0, Math.min(100, Math.round((Number(p.pct) || 0) * 100)))}%` }} />
                    </span>
                </li>
            ))}
        </ol>
    );
}

function Bloque({ bloque }) {
    if (bloque.tipo === 'resumen') return <BloqueResumen bloque={bloque} />;
    const ancho = esAncho(bloque);
    return (
        <section className={ancho ? `${styles.bloque} ${styles.bloqueAncho}` : styles.bloque} data-ancho={ancho ? 'completo' : undefined}>
            <h3 className={styles.titulo}>{bloque.titulo}</h3>
            {bloque.tipo === 'error' && <p className={styles.error}>{bloque.error}</p>}
            {bloque.tipo === 'tabla' && <BloqueTabla bloque={bloque} />}
            {bloque.tipo === 'kpis' && <BloqueKpis bloque={bloque} ancho={ancho} />}
            {bloque.tipo === 'avisos' && <BloqueAvisos bloque={bloque} />}
            {bloque.tipo === 'serie' && <BloqueSerie bloque={bloque} />}
            {bloque.tipo === 'embudo' && <BloqueEmbudo bloque={bloque} />}
            {bloque.nota && <p className={styles.nota}>{bloque.nota}</p>}
        </section>
    );
}

const horaDe = (iso) => {
    const d = iso ? new Date(iso) : new Date();
    return Number.isNaN(d.getTime()) ? '' : `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export default function AdminPage() {
    return <AdminNavigationProvider><AdminPanel /></AdminNavigationProvider>;
}

function AdminPanel() {
    const [vista, setVista] = useAdminNavigationState('vista', 'metricas', (v) => ['metricas', 'cuentas'].includes(v));
    const [dias, setDias] = useAdminNavigationState('dias', 7, (v) => RANGOS.includes(v));
    const [estado, setEstado] = useState('cargando');
    const [datos, setDatos] = useState(null);
    const [intento, setIntento] = useState(0);
    // [P1-PLAN-LOTE-770] Con datos ya pintados, cambiar de periodo NO vuelve a «Cargando…»: los datos se quedan,
    // atenuados, hasta que llegan los nuevos (y entran con un fundido). `pendiente` es esa espera; `fallo`, que el
    // refresco falló pero sigue habiendo algo que mostrar.
    const [pendiente, setPendiente] = useState(false);
    const [fallo, setFallo] = useState(false);
    const [version, setVersion] = useState(0);
    useAdminLoading(vista === 'metricas' && estado === 'cargando');

    useEffect(() => {
        fetchWithAuth('/api/admin/yo').catch(() => {});
    }, []);

    useEffect(() => {
        let vivo = true;
        const fallar = () => { if (!vivo) return; setPendiente(false); setFallo(true); setEstado((e) => (e === 'listo' ? e : 'error')); };
        (async () => {
            try {
                const r = await fetchWithAuth(`/api/admin/metricas?dias=${dias}`);
                if (!vivo) return;
                if (r.status === 404 || r.status === 401) { setEstado('fuera'); return; }
                if (!r.ok) { fallar(); return; }
                const cuerpo = await r.json();
                if (!vivo) return;
                setDatos(cuerpo);
                setVersion((v) => v + 1);
                setPendiente(false);
                setFallo(false);
                setEstado('listo');
            } catch {
                fallar();
            }
        })();
        return () => { vivo = false; };
    }, [dias, intento]);

    // Con datos a la vista se espera sobre ellos; sin datos, «Cargando…».
    const empezar = () => { setFallo(false); if (datos) setPendiente(true); else setEstado('cargando'); };
    // El periodo que ya está activo no relanzaría el efecto: sin este corte, la espera se quedaba para siempre.
    const elegir = (d) => { if (d === dias) return; empezar(); setDias(d); };
    const recargar = () => { empezar(); setIntento((n) => n + 1); };
    const ocupado = estado === 'cargando' || pendiente;
    const iActivo = Math.max(0, RANGOS.indexOf(dias));

    if (estado === 'fuera') return <Navigate to="/dashboard" replace />;
    return (
        <main className={styles.pagina}>
            <header className={styles.cabecera}>
                <div>
                    <h1 className={styles.h1}>{TEXTOS.titulo}</h1>
                    {estado === 'listo' && datos && <p className={styles.sub}>{TEXTOS.actualizado(horaDe(datos.generado))}</p>}
                </div>
                <Link to="/dashboard" className={styles.volver}>
                    <ArrowLeft size={16} strokeWidth={2.25} aria-hidden="true" />
                    {TEXTOS.volver}
                </Link>
            </header>
            {/* [P1-PLAN-LOTE-775] Métricas | Cuentas, con la misma pastilla deslizante que el periodo */}
            <div className={styles.pestanas}>
                <div className={styles.rangos} role="tablist" aria-label={TEXTOS.secciones} style={{ '--i': vista === 'cuentas' ? 1 : 0, '--n': 2 }}>
                    <span className={styles.indicador} aria-hidden="true" />
                    {[['metricas', TEXTOS.metricas], ['cuentas', TEXTOS.cuentas]].map(([id, texto]) => (
                        <button
                            key={id}
                            type="button"
                            role="tab"
                            aria-selected={vista === id}
                            className={vista === id ? `${styles.rango} ${styles.rangoActivo}` : styles.rango}
                            onClick={() => setVista(id)}
                        >
                            {texto}
                        </button>
                    ))}
                </div>
            </div>
            {vista === 'cuentas' && <AdminCuentas />}
            {vista === 'metricas' && (
                <>
                    <div className={styles.barraHerramientas}>
                        <div className={styles.rangos} role="group" aria-label={TEXTOS.periodo} style={{ '--i': iActivo, '--n': RANGOS.length }}>
                            <span className={styles.indicador} aria-hidden="true" data-indicador="" />
                            {RANGOS.map((d) => (
                                <button
                                    key={d}
                                    type="button"
                                    className={d === dias ? `${styles.rango} ${styles.rangoActivo}` : styles.rango}
                                    aria-pressed={d === dias}
                                    onClick={() => elegir(d)}
                                >
                                    {TEXTOS.dias(d)}
                                </button>
                            ))}
                        </div>
                        <div className={styles.acciones}>
                            <span className={styles.refresco} role="status" aria-live="polite">
                                {pendiente && <><span className={styles.girando} aria-hidden="true" />{TEXTOS.actualizando}</>}
                                {!pendiente && fallo && estado === 'listo' && TEXTOS.errorRefresco}
                            </span>
                            <button type="button" className={styles.boton} onClick={recargar} disabled={ocupado}>
                                {fallo && estado === 'listo' ? TEXTOS.reintentar : TEXTOS.actualizar}
                            </button>
                        </div>
                    </div>
                    {estado === 'cargando' && <p className={styles.estado}>{TEXTOS.cargando}</p>}
                    {estado === 'error' && (
                        <div className={styles.estado}>
                            <p>{TEXTOS.errorCarga}</p>
                            <button type="button" className={styles.boton} onClick={recargar}>{TEXTOS.reintentar}</button>
                        </div>
                    )}
                    {estado === 'listo' && datos && (
                        <div
                            key={version}
                            className={pendiente ? `${styles.contenido} ${styles.contenidoEspera}` : styles.contenido}
                            aria-busy={pendiente ? 'true' : undefined}
                            data-contenido=""
                        >
                            {seccionesDe(datos.bloques).map((s, i) => (
                                <div key={`${s.nombre}-${i}`} className={styles.seccion} data-seccion={s.nombre || undefined}>
                                    {s.nombre && <h2 className={styles.seccionTitulo}>{s.nombre}</h2>}
                                    <div className={styles.rejilla}>
                                        {s.bloques.map((b) => <Bloque key={b.id} bloque={b} />)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    {/* [P1-PLAN-LOTE-834 · 2026-09-29] «Ajustes de la gente», con el periodo ya elegido; fuera del bloque
                        con `key` para que cambiar de periodo no lo desmonte. Un 404 (interruptor apagado) no pinta nada.
                        «Actualizar» también lo refresca. */}
                    {estado === 'listo' && datos && <AdminAjustesResumen dias={dias} version={intento} />}
                </>
            )}
        </main>
    );
}
