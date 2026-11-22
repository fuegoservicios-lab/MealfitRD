// frontend/src/pages/AdminPage.jsx
// [P1-PLAN-LOTE-579 · 2026-09-27] Panel de administración, capa 1 (docs/superpowers/specs/2026-09-27-panel-admin-design.md).
// Pintor GENÉRICO: el servidor manda cada bloque con su título y sus filas ya redactadas (una métrica nueva es solo
// backend) y aquí solo se pintan. Es interno —solo el dueño, solo español—: los textos fijos viven en TEXTOS, con su
// marca de exención de i18n.
// [P1-PLAN-LOTE-621 / 638 / 770 / 992 / 993] Rediseño operativo: barra fija translúcida con salto rápido por sección,
// tarjetas Bento con minigráficas y series interactivas (lectura al pasar el cursor), avisos con iconos de gravedad y
// clave estable al refrescar, teclado completo en pestañas y carga con esqueletos.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
    AlertOctagon, AlertTriangle, ArrowLeft, ArrowUpRight, CheckCircle2, ChevronDown, Clock, Info, RefreshCw,
} from 'lucide-react';
import { fetchWithAuth } from '../config/api';
import { CABECERA_ACCION } from '../utils/adminCuentas';
import AdminAjustesResumen from './AdminAjustesResumen';
import AdminCuentas from './AdminCuentas';
import styles from './AdminPage.module.css';
import { AdminNavigationProvider, useAdminLoading, useAdminNavigationState } from '../hooks/useAdminNavigation';

const RANGOS = [7, 30, 90];
const VISTAS = [
    ['cuentas', 'Cuentas'], // [I18N-EXEMPT: panel interno del dueño, solo español]
    ['metricas', 'Métricas'],
];
// Enfriamiento para evitar ráfagas de peticiones al volver de DevTools o cambiar rápido entre ventanas.
const COOLDOWN_FOCO_MS = 5000;

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
    automatico: 'Actualización automática cada 30 s mientras este panel está visible.',
    subCuentas: 'Gestión de cuentas, regalos, ajustes y pruebas.',
    gruposAvisos: { activo: 'Problemas activos', revision: 'Pendientes de revisión', espera: 'Esperando al usuario', historial: 'Eventos anteriores' },
    sinActivos: 'Sin problemas activos: nada está fallando ahora mismo.',
    // [P1-PLAN-LOTE-993] qué significa cada grupo, en una línea bajo su título
    explicaGrupo: {
        activo: 'Afecta ahora a alguien que usa la app, o al sistema entero.',
        revision: 'Conviene mirarlo, pero no está rompiendo nada ahora.',
        espera: 'De cuentas que no se usan: no hace falta actuar; se retoma si vuelven.',
        historial: 'Notas informativas, lo que ya no aplica y lo resuelto en los últimos 7 días.',
    },
    marcarRevisado: 'Marcar como revisado',
    confirmarRevisado: '¿Seguro? Pulsa otra vez',
    guardandoRevisado: 'Guardando…',
    errorRevisado: 'No se pudo marcar. Reintenta.',
    etiquetaObsoleto: 'Ya no aplica',
    etiquetaEspera: 'En espera',
    etiquetaEvento: 'Evento',
    etiquetaResuelto: 'Resuelto',
    principales: 'Cifras principales',
    nivel: { critico: 'Crítico', aviso: 'Revisar', info: 'Informativo' },
    secciones: 'Secciones del panel',
    saltoRapido: 'Ir a sección',
    metricas: 'Métricas',
    cuentas: 'Cuentas',
    enCurso: '(en curso)',
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
                        <li key={`${f.etiqueta}-${i}`} className={styles.destacado}>
                            <span className={esCero(f.valor) ? `${styles.destacadoValor} ${styles.valorCero}` : styles.destacadoValor}>{f.valor}</span>
                            <span className={styles.destacadoEtiqueta}>{f.etiqueta}</span>
                        </li>
                    ))}
                </ul>
            )}
            {grupos.length > 0 && (
                <div className={ancho ? `${styles.kpis} ${styles.kpisAncho}` : styles.kpis}>
                    {grupos.map((g, i) => (
                        <div key={`${g.padre?.etiqueta || 'sub'}-${i}`} className={styles.grupo}>
                            {g.padre && <Fila fila={g.padre} />}
                            {g.hijas.map((f, j) => <Fila key={`${f.etiqueta}-${j}`} fila={f} />)}
                        </div>
                    ))}
                </div>
            )}
        </>
    );
}

function BloqueTabla({ bloque }) {
    const numericas = bloque.columnas.map((_, j) => bloque.filas.length > 0 && bloque.filas.every((f) => celdaNumerica(f[j])));
    const largas = bloque.columnas.map((_, j) => !numericas[j] && bloque.filas.some((f) => String(f[j] ?? '').length > TEXTO_LARGO));
    return (
        <div className={styles.tablaScroll}>
            <table className={styles.tabla} style={{ '--columnas': bloque.columnas.length }}>
                <thead>
                    <tr>{bloque.columnas.map((c, j) => <th key={`${c}-${j}`} className={numericas[j] ? styles.num : undefined}>{c}</th>)}</tr>
                </thead>
                <tbody>
                    {bloque.filas.map((fila, i) => (
                        <tr key={`${fila[0] ?? 'r'}-${i}`}>
                            {fila.map((celda, j) => (
                                <td
                                    key={j}
                                    className={numericas[j] ? styles.num : (FECHA.test(String(celda)) ? styles.sinPartir : undefined)}
                                    data-numerica={numericas[j] ? 'true' : undefined}
                                >
                                    {largas[j] ? <div className={styles.textoLargo} data-texto-largo="">{celda}</div> : celda}
                                    {j === 0 && Array.isArray(bloque.barras) && typeof bloque.barras[i] === 'number' && (
                                        <span className={styles.barraCarril} aria-hidden="true">
                                            <span
                                                className={styles.barra}
                                                data-barra=""
                                                aria-hidden="true"
                                                style={{ width: `${Math.max(0, Math.min(100, Math.round(bloque.barras[i] * 100)))}%` }}
                                            />
                                        </span>
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

// [P1-PLAN-LOTE-992 · 2026-11-12] El color de la CIFRA va aparte del color del CAMBIO.
const tonoValorDe = (t) => {
    if (t.tono_valor) return tonoDe(t.tono_valor);
    return !t.cambio && t.tono && t.tono !== 'neutro' ? tonoDe(t.tono) : null;
};

const irASeccion = (nombre) => {
    const destino = [...document.querySelectorAll('[data-seccion]')].find((s) => s.dataset.seccion === nombre);
    if (!destino) return;
    const quieto = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    destino.scrollIntoView?.({ behavior: quieto ? 'auto' : 'smooth', block: 'start' });
    destino.querySelector('h2')?.focus?.({ preventScroll: true });
};

/** Minigráfica interactiva: al pasar el cursor por cualquier barra muestra el detalle exacto de ese día/semana. */
function Mini({ serie, titulo }) {
    const [activa, setActiva] = useState(null);
    const max = Math.max(0, ...serie.map((p) => Number(p.valor) || 0));
    const ultima = serie.length - 1;
    const texto = (p, i) => `${p.etiqueta}: ${p.texto}${i === ultima ? ` ${TEXTOS.enCurso}` : ''}`;
    const label = titulo ? `${titulo}: ${serie.map(texto).join(', ')}` : serie.map(texto).join(', ');
    const puntoActivo = activa !== null && serie[activa] ? texto(serie[activa], activa) : null;
    return (
        <div className={styles.miniWrap} onMouseLeave={() => setActiva(null)}>
            <div className={styles.miniLectura} aria-hidden="true">
                {puntoActivo ? <span className={styles.miniBadge}>{puntoActivo}</span> : <span className={styles.miniHint}>{titulo || ''}</span>}
            </div>
            <span className={styles.mini} role="img" aria-label={label} data-mini="" data-hovered={activa !== null ? 'true' : undefined}>
                {serie.map((p, i) => {
                    const v = Number(p.valor) || 0;
                    return (
                        <span
                            key={`${p.etiqueta}-${i}`}
                            className={styles.miniBarra}
                            data-cero={v === 0 ? 'true' : undefined}
                            data-actual={i === ultima ? 'true' : undefined}
                            data-activa={activa === i ? 'true' : undefined}
                            title={texto(p, i)}
                            onMouseEnter={() => setActiva(i)}
                            style={{ height: `${max > 0 && v > 0 ? Math.max(8, Math.round((v / max) * 100)) : 0}%` }}
                        />
                    );
                })}
            </span>
        </div>
    );
}

/** La franja de arriba: tarjetas Bento con cifra, cambio en píldora, contexto y minigráfica interactiva. */
function BloqueResumen({ bloque, secciones }) {
    return (
        <ul className={styles.resumen} aria-label={bloque.titulo}>
            {(bloque.tarjetas || []).map((t, i) => {
                const tonoValor = tonoValorDe(t);
                const destino = typeof t.destino === 'string' && secciones?.has(t.destino) ? t.destino : null;
                const contenido = (
                    <>
                        <div className={styles.resumenCabeza}>
                            <span className={styles.resumenEtiqueta}>{t.etiqueta}</span>
                            {destino && <ArrowUpRight size={15} strokeWidth={2.2} className={styles.resumenFlecha} aria-hidden="true" />}
                        </div>
                        <span className={styles.resumenValor} data-tono-valor={tonoValor || undefined}>
                            {tonoValor && <span className={styles.punto} aria-hidden="true" />}
                            {t.valor}
                        </span>
                        {t.cambio && <span className={styles.resumenCambio}>{t.cambio}</span>}
                        {t.extra && <span className={styles.resumenExtra}>{t.extra}</span>}
                        {t.ayuda && <span className={styles.resumenAyuda}>{t.ayuda}</span>}
                        {Array.isArray(t.serie) && t.serie.length > 1 && <Mini serie={t.serie} titulo={t.serie_titulo} />}
                    </>
                );
                return (
                    <li
                        key={`${t.etiqueta}-${i}`}
                        className={styles.resumenCelda}
                        data-tono={tonoDe(t.tono)}
                        data-tono-tarjeta={tonoValor || undefined}
                    >
                        {destino ? (
                            <button type="button" className={styles.resumenBoton} onClick={() => irASeccion(destino)} data-destino={destino}>
                                {contenido}
                            </button>
                        ) : contenido}
                    </li>
                );
            })}
        </ul>
    );
}

/** [P1-PLAN-LOTE-993] Cierra las alertas de una fila. Dos pulsaciones: la primera arma, la segunda guarda; sin la
 * segunda en 4 s, se desarma. Si el problema sigue, el backend lo reabre en su próxima pasada. */
function BotonRevisado({ huellas, onHecho }) {
    const [paso, setPaso] = useState('listo');
    useEffect(() => {
        if (paso !== 'armado') return undefined;
        const t = setTimeout(() => setPaso('listo'), 4000);
        return () => clearTimeout(t);
    }, [paso]);
    const pulsar = async () => {
        if (paso === 'guardando') return;
        if (paso !== 'armado') { setPaso('armado'); return; }
        setPaso('guardando');
        try {
            const r = await fetchWithAuth('/api/admin/avisos/revisado', {
                method: 'POST', headers: CABECERA_ACCION, body: JSON.stringify({ huellas }),
            });
            if (!r.ok) throw new Error(String(r.status));
            setPaso('listo');
            onHecho?.();
        } catch {
            setPaso('error');
        }
    };
    const texto = { armado: TEXTOS.confirmarRevisado, guardando: TEXTOS.guardandoRevisado, error: TEXTOS.errorRevisado }[paso]
        || TEXTOS.marcarRevisado;
    return (
        <button type="button" className={styles.avisoRevisado} data-paso={paso} onClick={pulsar} disabled={paso === 'guardando'}>
            {texto}
        </button>
    );
}

const etiquetaAviso = (a, nivel) => {
    if (a.estado === 'resuelto') return TEXTOS.etiquetaResuelto;
    if (a.estado === 'obsoleto') return TEXTOS.etiquetaObsoleto;
    if (a.grupo === 'espera') return TEXTOS.etiquetaEspera;
    if (a.grupo === 'historial') return TEXTOS.etiquetaEvento;
    return TEXTOS.nivel[nivel];
};

function IconoAviso({ aviso: a, nivel }) {
    if (a.estado === 'resuelto') return <CheckCircle2 size={14} strokeWidth={2.2} aria-hidden="true" />;
    if (a.grupo === 'espera') return <Clock size={14} strokeWidth={2.2} aria-hidden="true" />;
    if (nivel === 'critico') return <AlertOctagon size={14} strokeWidth={2.2} aria-hidden="true" />;
    if (nivel === 'aviso') return <AlertTriangle size={14} strokeWidth={2.2} aria-hidden="true" />;
    return <Info size={14} strokeWidth={2.2} aria-hidden="true" />;
}

/** Clave estable por alerta: el refresco de 30 s no puede desplazar el estado «armado» de BotonRevisado a otra fila. */
const claveAviso = (a, i) => (Array.isArray(a.resolver) && a.resolver.length > 0
    ? a.resolver.join(',')
    : `${a.grupo || 'g'}-${a.estado || 'e'}-${a.titulo || ''}-${i}`);

function BloqueAvisos({ bloque, onCambio }) {
    const items = bloque.items || [];
    if (items.length === 0) {
        return (
            <p className={styles.vacio}>
                <CheckCircle2 size={16} strokeWidth={2.2} aria-hidden="true" />
                {bloque.vacio}
            </p>
        );
    }
    const lista = (filas) => (
        <ul className={styles.avisos}>
            {filas.map((a, i) => {
                const nivel = nivelDe(a.nivel);
                return (
                    <li key={claveAviso(a, i)} className={styles.aviso} data-nivel-aviso={nivel} data-estado-aviso={a.estado}>
                        <span className={styles.avisoNivel}>
                            <IconoAviso aviso={a} nivel={nivel} />
                            {etiquetaAviso(a, nivel)}
                        </span>
                        <span className={styles.avisoTexto}>
                            <span className={styles.avisoTitulo}>{a.titulo}</span>
                            {a.detalle && <span className={styles.avisoDetalle}>{a.detalle}</span>}
                            {a.accion && <span className={styles.avisoAccion}>{a.accion}</span>}
                            {(a.momento || (Array.isArray(a.resolver) && a.resolver.length > 0 && a.estado !== 'resuelto')) && (
                                <span className={styles.avisoPie}>
                                    {a.momento && <span className={styles.avisoMomento}>{a.momento}</span>}
                                    {Array.isArray(a.resolver) && a.resolver.length > 0 && a.estado !== 'resuelto' && (
                                        <BotonRevisado huellas={a.resolver} onHecho={onCambio} />
                                    )}
                                </span>
                            )}
                        </span>
                        <span className={styles.avisoValor}>{a.valor}</span>
                    </li>
                );
            })}
        </ul>
    );
    if (!items.some((a) => a.grupo)) return lista(items);
    const grupos = Object.keys(TEXTOS.gruposAvisos).map((grupo) => ({
        grupo, filas: items.filter((a) => (TEXTOS.gruposAvisos[a.grupo] ? a.grupo : 'activo') === grupo),
    }));
    return (
        <div className={styles.gruposAvisos}>
            {!grupos[0].filas.length && (
                <p className={styles.sinActivos}>
                    <CheckCircle2 size={15} strokeWidth={2.2} aria-hidden="true" />
                    {TEXTOS.sinActivos}
                </p>
            )}
            {grupos.filter((g) => g.filas.length).map(({ grupo, filas }) => {
                const total = filas.reduce((n, a) => n + (Number(String(a.valor).replaceAll(',', '')) || 0), 0);
                const titulo = `${TEXTOS.gruposAvisos[grupo]} (${total})`;
                const explica = <p className={styles.grupoAvisosExplica}>{TEXTOS.explicaGrupo[grupo]}</p>;
                return grupo === 'historial' ? (
                    <details key={grupo} className={styles.historialAvisos}>
                        <summary className={styles.historialResumen}>
                            <span>{titulo}</span>
                            <ChevronDown size={15} strokeWidth={2.2} className={styles.historialFlecha} aria-hidden="true" />
                        </summary>
                        {explica}
                        {lista(filas)}
                    </details>
                ) : (
                    <section key={grupo} aria-label={titulo} data-grupo-aviso={grupo}>
                        <h4 className={styles.grupoAvisosTitulo}>{titulo}</h4>
                        {explica}
                        {lista(filas)}
                    </section>
                );
            })}
        </div>
    );
}

function BloqueSerie({ bloque }) {
    const [activa, setActiva] = useState(null);
    const puntos = bloque.puntos || [];
    const max = Math.max(0, ...puntos.map((p) => Number(p.valor) || 0));
    const paso = Math.ceil(puntos.length / ROTULOS_MAX) || 1;
    const conCifra = puntos.length <= 14;
    const minDistFinal = Math.max(2, Math.ceil(paso / 2));
    const ultimo = puntos.length - 1;
    const puntoActivo = activa !== null && puntos[activa] ? puntos[activa] : null;
    return (
        <div className={styles.serieWrap} onMouseLeave={() => setActiva(null)}>
            <div className={styles.serieCabeza} aria-hidden="true">
                {puntoActivo ? (
                    <span className={styles.serieTooltip}>
                        <strong>{puntoActivo.texto}</strong>
                        <span>· {puntoActivo.etiqueta}</span>
                    </span>
                ) : (
                    <span className={styles.serieGuia}>{puntos.length > 0 ? `${puntos[0].etiqueta} – ${puntos[ultimo].etiqueta}` : ''}</span>
                )}
            </div>
            <div
                className={styles.serie}
                role="list"
                data-hovered={activa !== null ? 'true' : undefined}
                style={{ '--barras': puntos.length }}
            >
                {puntos.map((p, i) => {
                    const v = Number(p.valor) || 0;
                    const alto = max > 0 ? Math.round((v / max) * 100) : 0;
                    const esUltimo = i === ultimo;
                    // Evita colisión entre la penúltima etiqueta y la del final en series de 10 o 30 puntos.
                    const rotulo = esUltimo || (i % paso === 0 && (ultimo - i) >= minDistFinal);
                    return (
                        <div
                            key={`${p.etiqueta}-${i}`}
                            className={styles.serieCol}
                            role="listitem"
                            aria-label={`${p.etiqueta}: ${p.texto}`}
                            title={`${p.etiqueta}: ${p.texto}`}
                            data-activa={activa === i ? 'true' : undefined}
                            onMouseEnter={() => setActiva(i)}
                        >
                            <span className={styles.serieCifra} data-cero={v === 0 ? 'true' : undefined}>
                                {conCifra || activa === i ? p.texto : ''}
                            </span>
                            <span className={styles.serieCarril}>
                                <span
                                    className={v === 0 ? `${styles.serieBarra} ${styles.serieBarraCero}` : styles.serieBarra}
                                    data-serie-barra=""
                                    style={{ height: `${alto}%` }}
                                />
                            </span>
                            <span className={styles.serieRotulo}>{rotulo ? p.etiqueta : ''}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function BloqueEmbudo({ bloque }) {
    return (
        <ol className={styles.embudo}>
            {(bloque.pasos || []).map((p, i) => (
                <li key={`${p.etiqueta}-${i}`} className={styles.paso}>
                    <span className={styles.pasoEtiqueta}>
                        <span className={styles.pasoIndice} aria-hidden="true">{i + 1}</span>
                        {p.etiqueta}
                    </span>
                    <span className={styles.pasoCifras}>
                        <strong>{p.valor}</strong>
                        {p.texto && <span className={styles.pasoPct}>{p.texto}</span>}
                    </span>
                    <span className={styles.pasoCarril} aria-hidden="true">
                        <span className={styles.pasoBarra} data-paso-barra="" style={{ width: `${Math.max(0, Math.min(100, Math.round((Number(p.pct) || 0) * 100)))}%` }} />
                    </span>
                </li>
            ))}
        </ol>
    );
}

function Bloque({ bloque, secciones, onCambio }) {
    if (bloque.tipo === 'resumen') return <BloqueResumen bloque={bloque} secciones={secciones} />;
    const ancho = esAncho(bloque);
    return (
        <section className={ancho ? `${styles.bloque} ${styles.bloqueAncho}` : styles.bloque} data-ancho={ancho ? 'completo' : undefined}>
            <h3 className={styles.titulo}>{bloque.titulo}</h3>
            {bloque.tipo === 'error' && <p className={styles.error}>{bloque.error}</p>}
            {bloque.tipo === 'tabla' && <BloqueTabla bloque={bloque} />}
            {bloque.tipo === 'kpis' && <BloqueKpis bloque={bloque} ancho={ancho} />}
            {bloque.tipo === 'avisos' && <BloqueAvisos bloque={bloque} onCambio={onCambio} />}
            {bloque.tipo === 'serie' && <BloqueSerie bloque={bloque} />}
            {bloque.tipo === 'embudo' && <BloqueEmbudo bloque={bloque} />}
            {bloque.nota && <p className={styles.nota}>{bloque.nota}</p>}
        </section>
    );
}

function EsqueletoMetricas() {
    return (
        <div className={styles.esqueleto} aria-hidden="true">
            <div className={styles.esqueletoGrid}>
                {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className={styles.esqueletoCard} />)}
            </div>
            <div className={styles.esqueletoBloque} />
        </div>
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
    const [vista, setVista] = useAdminNavigationState('vista', 'cuentas', (v) => ['cuentas', 'metricas'].includes(v));
    const [dias, setDias] = useAdminNavigationState('dias', 7, (v) => RANGOS.includes(v));
    const [estado, setEstado] = useState('cargando');
    const [datos, setDatos] = useState(null);
    const [intento, setIntento] = useState(0);
    const [pendiente, setPendiente] = useState(false);
    const [fallo, setFallo] = useState(false);
    const tabRefs = useRef([]);
    const ultimoRefrescoRef = useRef(0);
    useAdminLoading(vista === 'metricas' && estado === 'cargando');

    // Comprobación de acceso al montar: incluso si `sessionStorage` restauró `vista = 'cuentas'`, un no-admin sale a `/dashboard`.
    useEffect(() => {
        let vivo = true;
        fetchWithAuth('/api/admin/yo')
            .then((r) => {
                if (vivo && (r?.status === 401 || r?.status === 404)) setEstado('fuera');
            })
            .catch(() => {});
        return () => { vivo = false; };
    }, []);

    useEffect(() => {
        if (vista !== 'metricas') {
            setPendiente(false);
            return undefined;
        }
        let vivo = true;
        let enCurso = false;
        let fuera = false;
        let timer;
        const controller = new AbortController();
        const programar = () => { clearTimeout(timer); if (vivo && !fuera) timer = setTimeout(cargar, 30000); };
        const fallar = () => { if (!vivo) return; setPendiente(false); setFallo(true); setEstado((e) => (e === 'listo' ? e : 'error')); };
        const cargar = async () => {
            if (!vivo || fuera || enCurso) return;
            if (document.visibilityState === 'hidden') { programar(); return; }
            enCurso = true;
            try {
                const r = await fetchWithAuth(`/api/admin/metricas?dias=${dias}`, { signal: controller.signal });
                if (!vivo) return;
                if (r.status === 404 || r.status === 401) { fuera = true; setEstado('fuera'); return; }
                if (!r.ok) { fallar(); return; }
                const cuerpo = await r.json();
                if (!vivo) return;
                ultimoRefrescoRef.current = Date.now();
                setDatos(cuerpo);
                setPendiente(false);
                setFallo(false);
                setEstado('listo');
            } catch {
                fallar();
            } finally {
                enCurso = false;
                programar();
            }
        };
        const alVolver = () => {
            if (document.visibilityState === 'hidden') return;
            if (Date.now() - ultimoRefrescoRef.current < COOLDOWN_FOCO_MS) return;
            clearTimeout(timer);
            cargar();
        };
        cargar();
        document.addEventListener('visibilitychange', alVolver);
        window.addEventListener('focus', alVolver);
        return () => {
            vivo = false;
            clearTimeout(timer);
            controller.abort();
            document.removeEventListener('visibilitychange', alVolver);
            window.removeEventListener('focus', alVolver);
        };
    }, [dias, intento, vista]);

    const empezar = () => { setFallo(false); if (datos) setPendiente(true); else setEstado('cargando'); };
    const elegir = (d) => { if (d === dias) return; empezar(); setDias(d); };
    const recargar = useCallback(() => {
        setFallo(false);
        setPendiente((prev) => (datos ? true : prev));
        if (!datos) setEstado('cargando');
        setIntento((n) => n + 1);
    }, [datos]);

    const secciones = useMemo(() => (datos?.bloques ? seccionesDe(datos.bloques) : []), [datos]);
    const nombresSeccion = useMemo(() => new Set(secciones.map((s) => s.nombre).filter(Boolean)), [secciones]);
    const saltos = useMemo(() => secciones.map((s) => s.nombre).filter(Boolean), [secciones]);

    const onKeyTab = (e, idx) => {
        if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
        let next = null;
        if (e.key === 'ArrowRight') next = (idx + 1) % VISTAS.length;
        else if (e.key === 'ArrowLeft') next = (idx - 1 + VISTAS.length) % VISTAS.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = VISTAS.length - 1;
        if (next === null) return;
        e.preventDefault();
        setVista(VISTAS[next][0]);
        tabRefs.current[next]?.focus();
    };

    const ocupado = estado === 'cargando' || pendiente;
    const iActivo = Math.max(0, RANGOS.indexOf(dias));

    if (estado === 'fuera') return <Navigate to="/dashboard" replace />;
    return (
        <main className={styles.pagina}>
            <header className={styles.cabecera}>
                <div className={styles.cabeceraTexto}>
                    <h1 className={styles.h1}>{TEXTOS.titulo}</h1>
                    {vista === 'metricas' && estado === 'listo' && datos && (
                        <p className={styles.sub}>
                            <span className={styles.pulsoVivo} aria-hidden="true" />
                            {TEXTOS.actualizado(horaDe(datos.generado))} · {TEXTOS.automatico}
                        </p>
                    )}
                    {vista === 'cuentas' && <p className={styles.sub}>{TEXTOS.subCuentas}</p>}
                </div>
                <Link to="/dashboard" className={styles.volver}>
                    <ArrowLeft size={16} strokeWidth={2.25} aria-hidden="true" />
                    {TEXTOS.volver}
                </Link>
            </header>

            <div className={styles.barraFija}>
                <div className={styles.barraSuperior}>
                    <div className={styles.rangos} role="tablist" aria-label={TEXTOS.secciones} style={{ '--i': vista === 'metricas' ? 1 : 0, '--n': 2 }}>
                        <span className={styles.indicador} aria-hidden="true" />
                        {VISTAS.map(([id, texto], idx) => (
                            <button
                                key={id}
                                ref={(el) => { tabRefs.current[idx] = el; }}
                                id={`admin-tab-${id}`}
                                type="button"
                                role="tab"
                                aria-selected={vista === id}
                                aria-controls={`admin-panel-${id}`}
                                tabIndex={vista === id ? 0 : -1}
                                className={vista === id ? `${styles.rango} ${styles.rangoActivo}` : styles.rango}
                                onClick={() => setVista(id)}
                                onKeyDown={(e) => onKeyTab(e, idx)}
                            >
                                {texto}
                            </button>
                        ))}
                    </div>

                    {vista === 'metricas' && (
                        <div className={styles.controlesMetricas}>
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
                                    <RefreshCw size={14} strokeWidth={2.2} className={ocupado ? styles.iconoGirando : styles.iconoBoton} aria-hidden="true" />
                                    {fallo && estado === 'listo' ? TEXTOS.reintentar : TEXTOS.actualizar}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {vista === 'metricas' && estado === 'listo' && saltos.length > 2 && (
                    <nav className={styles.saltos} aria-label={TEXTOS.saltoRapido}>
                        {saltos.map((nombre) => (
                            <button key={nombre} type="button" className={styles.salto} onClick={() => irASeccion(nombre)}>
                                {nombre}
                            </button>
                        ))}
                    </nav>
                )}
            </div>

            {vista === 'cuentas' && (
                <div id="admin-panel-cuentas" role="tabpanel" aria-labelledby="admin-tab-cuentas">
                    <AdminCuentas />
                </div>
            )}

            {vista === 'metricas' && (
                <div id="admin-panel-metricas" role="tabpanel" aria-labelledby="admin-tab-metricas">
                    {estado === 'cargando' && (
                        <div className={styles.estadoCarga}>
                            <p className={styles.estado}>{TEXTOS.cargando}</p>
                            <EsqueletoMetricas />
                        </div>
                    )}
                    {estado === 'error' && (
                        <div className={styles.estadoError}>
                            <p>{TEXTOS.errorCarga}</p>
                            <button type="button" className={styles.boton} onClick={recargar}>{TEXTOS.reintentar}</button>
                        </div>
                    )}
                    {estado === 'listo' && datos && (
                        <div
                            className={pendiente ? `${styles.contenido} ${styles.contenidoEspera}` : styles.contenido}
                            aria-busy={pendiente ? 'true' : undefined}
                            data-contenido=""
                        >
                            {secciones.map((s, i) => (
                                <div key={`${s.nombre || 's'}-${i}`} className={styles.seccion} data-seccion={s.nombre || undefined}>
                                    {s.nombre && <h2 className={styles.seccionTitulo} tabIndex={-1}>{s.nombre}</h2>}
                                    <div className={styles.rejilla}>
                                        {s.bloques.map((b) => <Bloque key={b.id} bloque={b} secciones={nombresSeccion} onCambio={recargar} />)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    {estado === 'listo' && datos && <AdminAjustesResumen dias={dias} version={intento} />}
                </div>
            )}
        </main>
    );
}
