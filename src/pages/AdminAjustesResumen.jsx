// frontend/src/pages/AdminAjustesResumen.jsx
// [P1-PLAN-LOTE-834 · 2026-09-29] Métricas → «Ajustes de la gente» (spec
// docs/superpowers/specs/2026-09-29-admin-cuentas-actividad-pruebas-design.md §13.7; contrato 8). Responde a «¿qué
// apaga la gente?» sin abrir ninguna cuenta: un agregado sin las cuentas admin, que no deja rastro.
//   · Por ajuste, una barra apilada (con un valor elegido · encendido · automático · apagado · sin elegir) y, al lado,
//     sus números EN TEXTO: la barra acompaña (`aria-hidden`), el dato va en las palabras. Mismos colores que los
//     estados de la ficha (lote 833) para que el admin aprenda UNA correspondencia; «sin elegir» lleva además trama.
//   · Los cambios del periodo por origen (la persona, el coach, el sistema) y los ajustes del dispositivo (tema,
//     permiso de notificaciones, plataformas).
//   · Pide `GET /api/admin/ajustes/resumen?dias=` con el periodo ya elegido en Métricas (acotado a 1..90) y otra vez con
//     «Actualizar». Un 404 (interruptor apagado) o una respuesta sin la forma del contrato no pintan nada; mientras
//     llega otro periodo, lo anterior se queda atenuado. Sin regiones vivas propias: la de Métricas es la única.
// Interno —solo el dueño, solo español—: los textos fijos viven en TEXTOS y en las tablas de abajo.
import { useEffect, useId, useState } from 'react';
import { compareText } from '../i18n';
import { cifra, nombreIdioma, nombrePais, pedirAdmin } from '../utils/adminCuentas';
import pagina from './AdminPage.module.css';
import styles from './AdminAjustesResumen.module.css';

// [I18N-EXEMPT: panel interno del dueño, solo español]
const TEXTOS = {
    titulo: 'Ajustes de la gente',
    base: (n, d) => `${n === 1 ? '1 cuenta' : `${n} cuentas`}, sin las de administración · cambios de los últimos ${d} días`,
    porAjuste: 'Cómo los tiene la gente',
    leyenda: 'Leyenda',
    estados: {
        valor: 'Con un valor elegido', encendido: 'Encendido', automatico: 'Automático', apagado: 'Apagado',
        sin_elegir: 'Sin elegir', relleno: 'Relleno',
    },
    otrosAjustes: 'Otros ajustes',
    sinDatos: 'Sin datos',
    // Con dos puntos: un valor que es cifra («Alimentos de siempre»: 0, 3, 12) se leía pegado a su cuenta («0 7»).
    cifra: (nombre, n) => `${nombre}: ${n}`,
    cambios: (d) => `Cambios de los últimos ${d} días`,
    sinCambios: 'Nadie cambió un ajuste en este periodo.',
    columnas: { ajuste: 'Ajuste', app: 'La persona', coach: 'El coach', sistema: 'El sistema', total: 'Total' },
    dispositivo: 'En el dispositivo',
    clavesDispositivo: { tema: 'Tema', notificaciones_permiso: 'Permiso de notificaciones', plataformas: 'Plataformas' },
    nadieInformo: 'Ningún dispositivo lo ha informado todavía.',
    si: 'Sí',
    no: 'No',
    sinValor: 'Sin valor',
    errorCarga: 'No se pudieron cargar los ajustes de la gente.',
    errorRefresco: 'No se pudieron actualizar los ajustes de la gente; sigues viendo los anteriores.',
    reintentar: 'Reintentar los ajustes',
};
// [I18N-EXEMPT: panel interno del dueño, solo español] Valores con nombre, por clave; lo demás sale tal cual.
const VALORES = {
    plan_mode: { plan: 'Plan', tracking: 'Seguimiento' },
    tema: { system: 'Automático (sistema)', light: 'Claro', dark: 'Oscuro' },
    notificaciones_permiso: { granted: 'Concedido', denied: 'Denegado', default: 'Sin preguntar', unsupported: 'No compatible' },
    plataformas: { web: 'Web', ios: 'iOS', android: 'Android', pwa: 'App instalada (PWA)' },
};

// Orden de los tramos (y de sus números). Los vecinos se distinguen también con la visión del color alterada (medido
// con un validador de paletas, en claro y en oscuro): «con valor» (añil) NO va junto a «automático» (celeste), que en
// oscuro quedaban a ΔE 13,5, por debajo del mínimo; así, el par más justo es verde–celeste (ΔE ≥ 15,7).
const ORDEN = ['valor', 'encendido', 'automatico', 'apagado', 'sin_elegir'];
const CONOCIDOS = new Set([...ORDEN, 'valores']);
const ORIGENES = ['app', 'coach', 'sistema'];
const CLAVES_DISPOSITIVO = ['tema', 'notificaciones_permiso', 'plataformas'];
const ORDEN_PLATAFORMAS = ['web', 'ios', 'android', 'pwa'];

const esCuenta = (v) => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(Number(v)) && Number(v) >= 0;
const objeto = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const objetos = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object' && !Array.isArray(x)) : []);
const esResumen = (cuerpo) => Boolean(cuerpo) && typeof cuerpo === 'object' && Array.isArray(cuerpo.ajustes);
/** Contrato 8: 1..90 días; lo que no es cifra vale 30. */
const acotarDias = (d) => Math.min(90, Math.max(1, Math.round(Number(d)) || 30));

function nombreValor(clave, v) {
    const conNombre = VALORES[clave]?.[v];
    if (conNombre) return conNombre;
    if (v === 'true') return TEXTOS.si;
    if (v === 'false') return TEXTOS.no;
    if (v === 'null') return TEXTOS.sinValor;
    if (clave === 'locale') return nombreIdioma(v) || v;
    if (clave === 'country') return nombrePais(v) || v;
    return v;
}

/** `{valor: n}` → [[valor, n]] con cuenta válida; las plataformas en su orden, lo demás de más a menos. */
function entradas(mapa, clave) {
    const pares = Object.entries(objeto(mapa)).filter(([, n]) => esCuenta(n)).map(([k, n]) => [k, Number(n)]);
    if (clave === 'plataformas') {
        const i = (k) => (ORDEN_PLATAFORMAS.includes(k) ? ORDEN_PLATAFORMAS.indexOf(k) : 99);
        return pares.sort(([a], [b]) => i(a) - i(b) || compareText(a, b));
    }
    return pares.sort(([ka, na], [kb, nb]) => nb - na || compareText(ka, kb));
}

function FilaAjuste({ ajuste: a }) {
    const conteo = objeto(a.conteo);
    const valores = entradas(conteo.valores, a.clave).filter(([, n]) => n > 0);
    const conValor = valores.reduce((s, [, n]) => s + n, 0);
    const tramos = [];
    if (conValor > 0) tramos.push({ estado: 'valor', n: conValor });
    for (const e of ORDEN.slice(1)) if (esCuenta(conteo[e]) && Number(conteo[e]) > 0) tramos.push({ estado: e, n: Number(conteo[e]) });
    // Un estado que el panel aún no conoce (p. ej. `relleno`) también cuenta: se pinta con su nombre.
    for (const [e, n] of Object.entries(conteo)) if (!CONOCIDOS.has(e) && esCuenta(n) && Number(n) > 0) tramos.push({ estado: e, n: Number(n) });
    const nombreDe = (e) => TEXTOS.estados[e] || e;
    const partes = [
        ...valores.map(([v, n]) => ({ clave: `valor:${v}`, texto: TEXTOS.cifra(nombreValor(a.clave, v), cifra(n)) })),
        ...tramos.filter((t) => t.estado !== 'valor').map((t) => ({ clave: t.estado, texto: TEXTOS.cifra(nombreDe(t.estado), cifra(t.n)) })),
    ];
    return (
        <li className={styles.fila} data-ajuste={a.clave}>
            <span className={styles.etiqueta}>{a.etiqueta || a.clave}</span>
            <span className={styles.barra} data-barra="" aria-hidden="true">
                {tramos.map((t) => (
                    <span key={t.estado} className={styles.tramo} data-segmento={t.estado} style={{ flexGrow: t.n }} title={TEXTOS.cifra(nombreDe(t.estado), cifra(t.n))} />
                ))}
            </span>
            <p className={styles.cifras}>
                {partes.length === 0
                    ? <span className={styles.cifra}>{TEXTOS.sinDatos}</span>
                    : partes.map((p) => <span key={p.clave} className={styles.cifra}>{p.texto}</span>)}
            </p>
        </li>
    );
}

function GrupoAjustes({ nombre, ajustes }) {
    const id = useId();
    return (
        <section className={styles.grupo} aria-labelledby={id}>
            <h4 id={id} className={styles.grupoTitulo}>{nombre}</h4>
            <ul className={styles.filas}>
                {ajustes.map((a, i) => <FilaAjuste key={`${a.clave}-${i}`} ajuste={a} />)}
            </ul>
        </section>
    );
}

function PorAjuste({ ajustes }) {
    const id = useId();
    const grupos = [];
    for (const a of ajustes) {
        const nombre = a.grupo || TEXTOS.otrosAjustes;
        let g = grupos.find((x) => x.nombre === nombre);
        if (!g) { g = { nombre, ajustes: [] }; grupos.push(g); }
        g.ajustes.push(a);
    }
    return (
        <section className={`${pagina.bloque} ${pagina.bloqueAncho}`} aria-labelledby={id}>
            <h3 id={id} className={pagina.titulo}>{TEXTOS.porAjuste}</h3>
            <ul className={styles.leyenda} aria-label={TEXTOS.leyenda}>
                {ORDEN.map((e) => (
                    <li key={e} className={styles.leyendaItem}>
                        <span className={styles.muestra} data-segmento={e} aria-hidden="true" />
                        {TEXTOS.estados[e]}
                    </li>
                ))}
            </ul>
            {grupos.length === 0 ? <p className={styles.vacio}>{TEXTOS.sinDatos}</p> : (
                <div className={styles.grupos}>
                    {grupos.map((g) => <GrupoAjustes key={g.nombre} nombre={g.nombre} ajustes={g.ajustes} />)}
                </div>
            )}
        </section>
    );
}

function Cambios({ cambios, dias }) {
    const id = useId();
    return (
        <section className={pagina.bloque} aria-labelledby={id}>
            <h3 id={id} className={pagina.titulo}>{TEXTOS.cambios(dias)}</h3>
            {cambios.length === 0 ? <p className={styles.vacio}>{TEXTOS.sinCambios}</p> : (
                <div className={pagina.tablaScroll}>
                    <table className={pagina.tabla} aria-labelledby={id} style={{ '--columnas': ORIGENES.length + 2 }}>
                        <thead>
                            <tr>
                                <th scope="col">{TEXTOS.columnas.ajuste}</th>
                                {ORIGENES.map((o) => <th key={o} scope="col" className={pagina.num}>{TEXTOS.columnas[o]}</th>)}
                                <th scope="col" className={pagina.num}>{TEXTOS.columnas.total}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {cambios.map((c, i) => {
                                const porOrigen = objeto(c.por_origen);
                                const total = Object.values(porOrigen).reduce((s, n) => s + (esCuenta(n) ? Number(n) : 0), 0);
                                return (
                                    <tr key={`${c.clave}-${i}`}>
                                        <td>{c.etiqueta || c.clave}</td>
                                        {ORIGENES.map((o) => {
                                            const n = esCuenta(porOrigen[o]) ? Number(porOrigen[o]) : 0;
                                            return <td key={o} className={n === 0 ? `${pagina.num} ${pagina.valorCero}` : pagina.num}>{cifra(n)}</td>;
                                        })}
                                        <td className={`${pagina.num} ${styles.total}`}>{cifra(total)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

function Dispositivo({ dispositivo }) {
    const id = useId();
    const d = objeto(dispositivo);
    return (
        <section className={pagina.bloque} aria-labelledby={id}>
            <h3 id={id} className={pagina.titulo}>{TEXTOS.dispositivo}</h3>
            <dl className={styles.dispositivo}>
                {CLAVES_DISPOSITIVO.map((k) => {
                    const pares = entradas(d[k], k);
                    return (
                        <div key={k} className={styles.dispositivoFila} data-dispositivo={k}>
                            <dt className={styles.dispositivoClave}>{TEXTOS.clavesDispositivo[k]}</dt>
                            <dd className={styles.valores}>
                                {pares.length === 0
                                    ? <span className={styles.vacio}>{TEXTOS.nadieInformo}</span>
                                    : pares.map(([v, n]) => <span key={v} className={styles.cifra}>{TEXTOS.cifra(nombreValor(k, v), cifra(n))}</span>)}
                            </dd>
                        </div>
                    );
                })}
            </dl>
        </section>
    );
}

/**
 * `dias`: el periodo elegido en Métricas (7/30/90). `version`: sube con «Actualizar»/«Reintentar» de Métricas, que
 * también refrescan este bloque.
 */
export default function AdminAjustesResumen({ dias, version = 0 }) {
    const d = acotarDias(dias);
    const idTitulo = useId();
    const [intento, setIntento] = useState(0);
    const [res, setRes] = useState(null);                   // { clave, dias, datos, fallo, fuera }
    const clave = `${d}#${version}#${intento}`;

    useEffect(() => {
        const ctrl = new AbortController();
        const esta = `${d}#${version}#${intento}`;
        (async () => {
            try {
                const cuerpo = await pedirAdmin(`/api/admin/ajustes/resumen?dias=${d}`, undefined, { signal: ctrl.signal });
                if (ctrl.signal.aborted) return;
                if (esResumen(cuerpo)) setRes({ clave: esta, dias: d, datos: cuerpo, fallo: false, fuera: false });
                else setRes({ clave: esta, dias: d, datos: null, fallo: false, fuera: true });
            } catch (err) {
                if (ctrl.signal.aborted) return;
                // 404: interruptor apagado (o no admin) ⇒ el bloque no existe. Otro fallo: se dice, y si ya había datos
                // se quedan a la vista.
                const fuera = err?.status === 404 || err?.status === 401;
                setRes((r) => ({ clave: esta, dias: r?.dias ?? d, datos: fuera ? null : (r?.datos ?? null), fallo: !fuera, fuera }));
            }
        })();
        return () => ctrl.abort();
    }, [d, version, intento]);

    if (!res || res.fuera || (!res.datos && !res.fallo)) return null;
    const pendiente = res.clave !== clave;
    const datos = res.datos;
    const reintentar = () => { if (!pendiente) setIntento((n) => n + 1); };
    return (
        <section
            className={`${pagina.seccion} ${styles.raiz}`}
            aria-labelledby={idTitulo}
            aria-busy={pendiente ? 'true' : undefined}
            data-ajustes-gente=""
        >
            <h2 id={idTitulo} className={pagina.seccionTitulo}>{TEXTOS.titulo}</h2>
            {datos && <p className={styles.base}>{TEXTOS.base(esCuenta(datos.cuentas) ? Number(datos.cuentas) : 0, res.dias)}</p>}
            {res.fallo && (
                <div className={styles.fallo}>
                    <p className={styles.falloTexto}>{datos ? TEXTOS.errorRefresco : TEXTOS.errorCarga}</p>
                    <button type="button" className={pagina.boton} onClick={reintentar} aria-disabled={pendiente || undefined}>
                        {TEXTOS.reintentar}
                    </button>
                </div>
            )}
            {datos && (
                <div className={pendiente ? `${pagina.rejilla} ${styles.espera}` : pagina.rejilla}>
                    <PorAjuste ajustes={objetos(datos.ajustes)} />
                    <Cambios cambios={objetos(datos.cambios)} dias={res.dias} />
                    <Dispositivo dispositivo={datos.dispositivo} />
                </div>
            )}
        </section>
    );
}
