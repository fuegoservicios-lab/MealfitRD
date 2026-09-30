// frontend/src/pages/AdminCuentasLista.jsx
// [P1-PLAN-LOTE-833 · 2026-09-29] Panel admin · Cuentas: la lista de TODAS las cuentas (spec
// docs/superpowers/specs/2026-09-29-admin-cuentas-actividad-pruebas-design.md §4.1, §4.5, §13.5, §13.6; contratos 1, 2
// y 6). Correo, nombre, plan y la actividad EN NÚMEROS —nunca contenido—, con búsqueda (espera de 300 ms), filtro,
// orden, páginas de 50, casillas para marcar varias como cuentas de prueba (un solo lote, con motivo) y el CSV con los
// mismos filtros. Tocar un correo abre su ficha (`onAbrir`). La pide ella misma al montarse: con el interruptor
// apagado el servidor responde 404, no pinta nada y avisa con `onDisponible(false)` para que el panel quede como hoy.
// Interno —solo el dueño, solo español—: los textos fijos viven en TEXTOS.
// [P1-PLAN-LOTE-833 · 2026-09-29, ronda 1] Una marca `sin_marca` no es de prueba (`marcaViva`); `onDisponible` va en una
// ref (un callback nuevo en cada render ya no vuelve a pedir la lista); una página que dejó de existir se corrige sola; tras
// marcar varias el foco va al resumen; y «Abriendo la cuenta…» o su fallo (`aviso`) salen junto al título.
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { fetchWithAuth } from '../config/api';
import AdminDialogoMotivo from './AdminDialogoMotivo';
import {
    NOMBRE_MODO, NOMBRE_PLAN, cifra, fecha, marcaViva, nombreCsvDeHoy, nombreDeArchivo, pedirAdmin, urlCsvCuentas, urlCuentas,
    usd,
} from '../utils/adminCuentas';
import base from './AdminCuentas.module.css';
import styles from './AdminCuentasLista.module.css';

// [I18N-EXEMPT: panel interno del dueño, solo español]
const TEXTOS = {
    titulo: 'Todas las cuentas',
    total: (n) => (n === 1 ? '1 cuenta' : `${n} cuentas`),
    herramientas: 'Buscar en la lista',
    buscar: 'Buscar por correo o nombre',
    filtro: 'Filtro',
    orden: 'Orden',
    descargar: 'Descargar CSV',
    descargando: 'Descargando…',
    errorCsv: 'No se pudo descargar el CSV.',
    seleccionarTodas: 'Seleccionar todas las de esta página',
    seleccionadas: (n) => (n === 1 ? '1 seleccionada' : `${n} seleccionadas`),
    marcarSeleccionadas: 'Marcar seleccionadas como prueba',
    quitarSeleccion: 'Quitar selección',
    seleccionar: (correo) => `Seleccionar ${correo}`,
    seleccion: 'Selección',
    cuenta: 'Cuenta',
    comidas30: (n) => `${n} en 30 días`,
    sinActividad: 'Sin actividad',
    prueba: 'Prueba',
    avisoPendiente: 'Aviso pendiente',
    admin: 'Admin',
    vacio: 'Ninguna cuenta coincide.',
    errorCarga: 'No se pudo cargar la lista de cuentas.',
    reintentar: 'Reintentar',
    actualizando: 'Actualizando…',
    errorRefresco: 'No se pudo actualizar la lista; sigues viendo la anterior.',
    paginacion: 'Páginas de la lista',
    pagina: (p, n) => `Página ${p} de ${n}`,
    anterior: 'Anterior',
    siguiente: 'Siguiente',
    tituloLote: (n) => (n === 1 ? 'Marcar 1 cuenta como de prueba' : `Marcar ${n} cuentas como de prueba`),
    explicacionLote: 'Cada persona verá un aviso en la app. Hasta que lo vea, el detalle de su cuenta sigue cerrado; los números y los ajustes no cambian.',
    botonLote: (n) => (n === 1 ? 'Marcar 1 cuenta' : `Marcar ${n} cuentas`),
    yMas: (n) => `y ${n} más`,
    resumenLote: (c) => [
        c.marcada && (c.marcada === 1 ? '1 marcada' : `${c.marcada} marcadas`),
        c.ya_marcada && (c.ya_marcada === 1 ? '1 ya estaba marcada' : `${c.ya_marcada} ya estaban marcadas`),
        c.salio_ella && (c.salio_ella === 1 ? '1 salió ella misma' : `${c.salio_ella} salieron ellas mismas`),
        c.no_existe && (c.no_existe === 1 ? '1 ya no existe' : `${c.no_existe} ya no existen`),
    ].filter(Boolean).join(' · ') || 'Ningún cambio.',
    salieron: 'Salieron ellas mismas del modo de prueba: vuelve a marcarlas una a una, desde su ficha, solo si te pidieron volver.',
    cerrarResumen: 'Cerrar',
    errorLote: {
        demasiadas: 'Son demasiadas a la vez: como mucho 100.',
        motivo: 'El motivo debe tener entre 3 y 300 caracteres.',
    },
};

// [I18N-EXEMPT: panel interno del dueño, solo español]
const FILTROS = [
    ['todas', 'Todas'], ['prueba', 'De prueba'], ['sin_marcar', 'Sin marcar'], ['activas_7d', 'Activas (7 días)'],
    ['inactivas_14d', 'Inactivas (14 días o más)'], ['con_plan', 'Con plan'], ['seguimiento', 'En seguimiento'],
];
// [I18N-EXEMPT: panel interno del dueño, solo español]
const ORDENES = [['actividad', 'Última actividad'], ['alta', 'Fecha de alta'], ['comidas', 'Comidas registradas'], ['gasto', 'Gasto de IA']];
// [I18N-EXEMPT: panel interno del dueño, solo español] Columnas de cifras: en el teléfono cada una rotula su celda.
const COLUMNAS = {
    ultima: 'Última actividad', comidas: 'Comidas', planes: 'Planes', mensajes: 'Mensajes al coach', escaneos: 'Escaneos',
    gasto: 'Gasto de IA (30 días)', dias: 'Días activos (30 días)', alta: 'Alta',
};

const ESPERA_BUSQUEDA_MS = 300;
const CORREOS_A_LA_VISTA = 5;
// [P1-PLAN-LOTE-716] Revocar el enlace del archivo en el acto podía cancelar la descarga en Safari.
const REVOCAR_TRAS_MS = 30000;

function mensajeLote(err) {
    if (err?.detalle && TEXTOS.errorLote[err.detalle]) return TEXTOS.errorLote[err.detalle];
    if (err?.status === 422) return TEXTOS.errorLote.motivo;
    return err?.message || TEXTOS.errorCarga;
}

function FilaCuenta({ c, elegida, onElegir, onAbrir }) {
    const a = c.actividad || {};
    const viva = marcaViva(c.prueba);
    const sub = [c.nombre, NOMBRE_PLAN[c.plan_efectivo] || c.plan_efectivo, NOMBRE_MODO[c.modo], c.pais].filter(Boolean).join(' · ');
    return (
        <tr data-cuenta={c.user_id}>
            <td className={styles.celdaSeleccion}>
                <label className={styles.casilla}>
                    <input
                        type="checkbox"
                        checked={elegida}
                        disabled={viva}
                        onChange={() => onElegir(c)}
                        aria-label={TEXTOS.seleccionar(c.email)}
                    />
                </label>
            </td>
            <td className={styles.celdaCuenta}>
                <button type="button" className={styles.correo} data-abrir-cuenta={c.user_id} onClick={() => onAbrir(c)}>{c.email}</button>
                {sub && <span className={styles.sub}>{sub}</span>}
                {(viva || c.es_admin) && (
                    <span className={styles.etiquetas}>
                        {viva && <span className={styles.chip} data-tono="prueba">{TEXTOS.prueba}</span>}
                        {viva && c.prueba.estado === 'aviso_pendiente' && <span className={styles.chip} data-tono="pendiente">{TEXTOS.avisoPendiente}</span>}
                        {c.es_admin && <span className={styles.chip} data-tono="admin">{TEXTOS.admin}</span>}
                    </span>
                )}
            </td>
            <td data-etiqueta={COLUMNAS.ultima} className={styles.fecha}>{a.ultima ? fecha(a.ultima) : TEXTOS.sinActividad}</td>
            <td data-etiqueta={COLUMNAS.comidas} className={styles.num}>
                <span>{cifra(a.comidas_total)}</span>
                <span className={styles.nota}>{TEXTOS.comidas30(cifra(a.comidas_30d))}</span>
            </td>
            <td data-etiqueta={COLUMNAS.planes} className={styles.num}>{cifra(a.planes)}</td>
            <td data-etiqueta={COLUMNAS.mensajes} className={styles.num}>{cifra(a.mensajes_coach)}</td>
            <td data-etiqueta={COLUMNAS.escaneos} className={styles.num}>{cifra(a.escaneos)}</td>
            <td data-etiqueta={COLUMNAS.gasto} className={styles.num}>{usd(a.gasto_ia_30d_usd)}</td>
            <td data-etiqueta={COLUMNAS.dias} className={styles.num}>{cifra(a.dias_activos_30d)}</td>
            <td data-etiqueta={COLUMNAS.alta} className={`${styles.num} ${styles.fecha}`}>{fecha(c.alta)}</td>
        </tr>
    );
}

export default function AdminCuentasLista({ version = 0, oculta = false, onDisponible, onAbrir, aviso = null }) {
    const idTitulo = useId();
    const idBuscar = useId();
    const idFiltro = useId();
    const idOrden = useId();
    const [texto, setTexto] = useState('');
    const [buscar, setBuscar] = useState('');
    const [filtro, setFiltro] = useState('todas');
    const [orden, setOrden] = useState('actividad');
    const [pagina, setPagina] = useState(1);
    const [intento, setIntento] = useState(0);
    const [estado, setEstado] = useState('cargando');   // cargando | lista | error | fuera
    const [datos, setDatos] = useState(null);
    const [pendiente, setPendiente] = useState(false);
    const [fallo, setFallo] = useState(false);
    const [seleccion, setSeleccion] = useState(() => new Map());   // user_id → correo, en el orden en que se marcan
    const [dialogo, setDialogo] = useState(false);
    const [resultado, setResultado] = useState(null);
    const [descargando, setDescargando] = useState(false);
    const [errorCsv, setErrorCsv] = useState('');
    const refTodas = useRef(null);
    const resumenRef = useRef(null);
    const enfocarResumen = useRef(false);
    // En una ref: un `onDisponible` escrito en línea cambia en cada render del padre y, en las dependencias del efecto,
    // volvía a pedir la lista en bucle (cada respuesta avisa, el padre se pinta, el callback es otro…).
    const onDisponibleRef = useRef(onDisponible);
    useEffect(() => { onDisponibleRef.current = onDisponible; });

    // La búsqueda espera 300 ms a que se deje de escribir: una petición por ráfaga, no una por tecla.
    useEffect(() => {
        const limpio = texto.trim();
        if (limpio === buscar) return undefined;
        const t = setTimeout(() => {
            setBuscar(limpio);
            setPagina(1);
            setSeleccion(new Map());
            setPendiente(true);
        }, ESPERA_BUSQUEDA_MS);
        return () => clearTimeout(t);
    }, [texto, buscar]);

    useEffect(() => {
        let vivo = true;
        (async () => {
            try {
                const r = await fetchWithAuth(urlCuentas({ buscar, orden, filtro, pagina }));
                if (!vivo) return;
                // 404: interruptor apagado (o no admin). El panel sigue como hoy.
                if (r.status === 404 || r.status === 401) { setEstado('fuera'); onDisponibleRef.current?.(false); return; }
                if (!r.ok) throw new Error(`Error ${r.status}`);
                const cuerpo = await r.json();
                if (!vivo) return;
                // La lista encogió por debajo de la página pedida (se marcaron cuentas, cambió el filtro en otra pestaña):
                // se pide la última que existe en vez de dejar una página vacía sin forma de volver.
                const ultima = Math.max(1, Math.ceil((Number(cuerpo?.total) || 0) / (Number(cuerpo?.por_pagina) || 50)));
                if (pagina > ultima) { setPagina(ultima); return; }
                setDatos(cuerpo);
                // Lo seleccionado que ya no se puede elegir (se marcó desde su ficha, o ya no sale) deja de estarlo.
                const elegiblesAhora = new Set((Array.isArray(cuerpo?.cuentas) ? cuerpo.cuentas : [])
                    .filter((c) => !marcaViva(c.prueba)).map((c) => c.user_id));
                setSeleccion((s) => ([...s.keys()].every((id) => elegiblesAhora.has(id))
                    ? s
                    : new Map([...s].filter(([id]) => elegiblesAhora.has(id)))));
                setPendiente(false);
                setFallo(false);
                setEstado('lista');
                onDisponibleRef.current?.(true);
            } catch {
                if (!vivo) return;
                setPendiente(false);
                setFallo(true);
                setEstado((e) => (e === 'lista' ? e : 'error'));
            }
        })();
        return () => { vivo = false; };
    }, [buscar, orden, filtro, pagina, version, intento]);

    const cuentas = Array.isArray(datos?.cuentas) ? datos.cuentas : [];
    const elegibles = cuentas.filter((c) => !marcaViva(c.prueba));
    const todas = elegibles.length > 0 && elegibles.every((c) => seleccion.has(c.user_id));
    const algunas = elegibles.some((c) => seleccion.has(c.user_id));

    // `indeterminate` no es un atributo: solo se pone por JS.
    useEffect(() => {
        if (refTodas.current) refTodas.current.indeterminate = algunas && !todas;
    });
    // Tras marcar varias, el botón que abrió el diálogo queda desactivado (ya no hay selección) y el hook no puede
    // devolverle el foco: va al resumen, que dice qué pasó con cada una.
    useEffect(() => {
        if (!enfocarResumen.current || !resumenRef.current) return;
        enfocarResumen.current = false;
        resumenRef.current.focus();
    });

    const cerrarDialogo = useCallback(() => setDialogo(false), []);

    if (estado === 'cargando' || estado === 'fuera') return null;

    const porPagina = Number(datos?.por_pagina) || 50;
    const total = Number(datos?.total) || 0;
    const paginas = Math.max(1, Math.ceil(total / porPagina));
    const nElegidas = seleccion.size;

    const reconsultar = () => { setSeleccion(new Map()); setPendiente(true); };
    const elegirFiltro = (v) => { setFiltro(v); setPagina(1); reconsultar(); };
    const elegirOrden = (v) => { setOrden(v); setPagina(1); reconsultar(); };
    const irAPagina = (p) => { if (p < 1 || p > paginas || p === pagina) return; setPagina(p); reconsultar(); };
    const reintentar = () => { if (pendiente) return; setFallo(false); setPendiente(true); setIntento((n) => n + 1); };

    const elegir = (c) => setSeleccion((s) => {
        const n = new Map(s);
        if (n.has(c.user_id)) n.delete(c.user_id); else n.set(c.user_id, c.email);
        return n;
    });
    const elegirTodas = () => setSeleccion((s) => {
        const n = new Map(s);
        if (todas) elegibles.forEach((c) => n.delete(c.user_id));
        else elegibles.forEach((c) => n.set(c.user_id, c.email));
        return n;
    });

    const marcarLote = async (motivo) => {
        const correos = new Map(seleccion);
        let respuesta;
        try {
            respuesta = await pedirAdmin('/api/admin/pruebas/lote', { user_ids: [...correos.keys()], motivo });
        } catch (err) {
            throw new Error(mensajeLote(err));
        }
        const cuenta = { marcada: 0, ya_marcada: 0, salio_ella: 0, no_existe: 0 };
        const salieron = [];
        for (const r of Array.isArray(respuesta?.resultados) ? respuesta.resultados : []) {
            if (Object.prototype.hasOwnProperty.call(cuenta, r.resultado)) cuenta[r.resultado] += 1;
            if (r.resultado === 'salio_ella') salieron.push({ user_id: r.user_id, email: correos.get(r.user_id) || r.user_id });
        }
        enfocarResumen.current = true;
        setResultado({ cuenta, salieron });
        setDialogo(false);
        reconsultar();
        setIntento((n) => n + 1);
    };

    const descargar = async () => {
        if (descargando) return;
        setDescargando(true);
        setErrorCsv('');
        try {
            const r = await fetchWithAuth(urlCsvCuentas({ buscar, orden, filtro }));
            if (!r.ok) throw new Error(`Error ${r.status}`);
            const blob = await r.blob();
            const nombre = nombreDeArchivo(r.headers?.get?.('Content-Disposition')) || nombreCsvDeHoy();
            const url = URL.createObjectURL(blob);
            const enlace = document.createElement('a');
            enlace.href = url;
            enlace.download = nombre;
            document.body.appendChild(enlace);
            enlace.click();
            enlace.remove();
            setTimeout(() => URL.revokeObjectURL(url), REVOCAR_TRAS_MS);
        } catch {
            setErrorCsv(TEXTOS.errorCsv);
        } finally {
            setDescargando(false);
        }
    };

    if (estado === 'error') {
        return (
            <section className={styles.lista} hidden={oculta} aria-labelledby={idTitulo}>
                <h2 id={idTitulo} className={styles.titulo} tabIndex={-1} data-titulo-lista="">{TEXTOS.titulo}</h2>
                <p className={styles.error} role="alert">{TEXTOS.errorCarga}</p>
                <div>
                    <button type="button" className={base.boton} onClick={reintentar} aria-disabled={pendiente || undefined}>{TEXTOS.reintentar}</button>
                </div>
            </section>
        );
    }

    const lista = [...seleccion.values()];
    const muestra = lista.length > CORREOS_A_LA_VISTA
        ? [...lista.slice(0, CORREOS_A_LA_VISTA), TEXTOS.yMas(lista.length - CORREOS_A_LA_VISTA)]
        : lista;

    return (
        <section className={styles.lista} hidden={oculta} aria-labelledby={idTitulo}>
            <div className={styles.cabecera}>
                <div>
                    <h2 id={idTitulo} className={styles.titulo} tabIndex={-1} data-titulo-lista="">{TEXTOS.titulo}</h2>
                    <p className={styles.meta}>{TEXTOS.total(total)}</p>
                    {/* Junto al título, no debajo de la tabla: abrir una cuenta de la fila 40 dice aquí qué pasa. */}
                    <p className={styles.meta} role="status">{aviso?.tipo === 'abriendo' ? aviso.texto : ''}</p>
                    {aviso?.tipo === 'error' && <p className={styles.error} role="alert">{aviso.texto}</p>}
                </div>
                <button type="button" className={base.boton} onClick={descargar} aria-disabled={descargando || undefined}>
                    {descargando ? TEXTOS.descargando : TEXTOS.descargar}
                </button>
            </div>
            {errorCsv && <p className={styles.error} role="alert">{errorCsv}</p>}
            <div className={styles.herramientas} role="search" aria-label={TEXTOS.herramientas}>
                <div className={`${styles.campo} ${styles.campoBuscar}`}>
                    <label htmlFor={idBuscar} className={base.etiqueta}>{TEXTOS.buscar}</label>
                    <input
                        id={idBuscar}
                        className={base.input}
                        type="search"
                        autoComplete="off"
                        spellCheck={false}
                        maxLength={120}
                        value={texto}
                        onChange={(e) => setTexto(e.target.value)}
                    />
                </div>
                <div className={styles.campo}>
                    <label htmlFor={idFiltro} className={base.etiqueta}>{TEXTOS.filtro}</label>
                    <select id={idFiltro} className={base.input} value={filtro} onChange={(e) => elegirFiltro(e.target.value)}>
                        {FILTROS.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
                    </select>
                </div>
                <div className={styles.campo}>
                    <label htmlFor={idOrden} className={base.etiqueta}>{TEXTOS.orden}</label>
                    <select id={idOrden} className={base.input} value={orden} onChange={(e) => elegirOrden(e.target.value)}>
                        {ORDENES.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
                    </select>
                </div>
            </div>
            <div className={styles.seleccion}>
                <label className={styles.opcion}>
                    <input ref={refTodas} type="checkbox" checked={todas} disabled={elegibles.length === 0} onChange={elegirTodas} />
                    {TEXTOS.seleccionarTodas}
                </label>
                <span className={styles.contador}>{TEXTOS.seleccionadas(nElegidas)}</span>
                <button type="button" className={base.primario} disabled={nElegidas === 0} onClick={() => setDialogo(true)}>
                    {TEXTOS.marcarSeleccionadas}
                </button>
                {nElegidas > 0 && (
                    <button type="button" className={styles.botonTexto} onClick={() => setSeleccion(new Map())}>{TEXTOS.quitarSeleccion}</button>
                )}
            </div>
            {resultado && (
                <div ref={resumenRef} className={styles.resultado} role="status" tabIndex={-1}>
                    <p className={styles.resultadoLinea}>{TEXTOS.resumenLote(resultado.cuenta)}</p>
                    {resultado.salieron.length > 0 && (
                        <>
                            <p className={styles.resultadoNota}>{TEXTOS.salieron}</p>
                            <ul className={styles.resultadoCorreos}>
                                {resultado.salieron.map((s) => (
                                    <li key={s.user_id}>
                                        <button type="button" className={styles.correo} onClick={() => onAbrir(s)}>{s.email}</button>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                    <div className={styles.resultadoPie}>
                        <button type="button" className={styles.botonTexto} onClick={() => setResultado(null)}>{TEXTOS.cerrarResumen}</button>
                    </div>
                </div>
            )}
            <p className={styles.estado} role="status">
                {pendiente ? TEXTOS.actualizando : (fallo ? TEXTOS.errorRefresco : '')}
            </p>
            <div className={styles.desplazable} aria-busy={pendiente ? 'true' : undefined}>
                {cuentas.length === 0 ? <p className={styles.vacio}>{TEXTOS.vacio}</p> : (
                    <table className={styles.tabla} aria-labelledby={idTitulo} data-tarjetas-movil="">
                        <thead>
                            <tr>
                                <th scope="col" className={styles.celdaSeleccion}><span className={styles.srOnly}>{TEXTOS.seleccion}</span></th>
                                <th scope="col">{TEXTOS.cuenta}</th>
                                <th scope="col">{COLUMNAS.ultima}</th>
                                <th scope="col" className={styles.num}>{COLUMNAS.comidas}</th>
                                <th scope="col" className={styles.num}>{COLUMNAS.planes}</th>
                                <th scope="col" className={styles.num}>{COLUMNAS.mensajes}</th>
                                <th scope="col" className={styles.num}>{COLUMNAS.escaneos}</th>
                                <th scope="col" className={styles.num}>{COLUMNAS.gasto}</th>
                                <th scope="col" className={styles.num}>{COLUMNAS.dias}</th>
                                <th scope="col" className={styles.num}>{COLUMNAS.alta}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {cuentas.map((c) => (
                                <FilaCuenta key={c.user_id} c={c} elegida={seleccion.has(c.user_id)} onElegir={elegir} onAbrir={onAbrir} />
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
            {paginas > 1 && (
                <nav className={styles.paginas} aria-label={TEXTOS.paginacion}>
                    <button type="button" className={base.boton} onClick={() => irAPagina(pagina - 1)} aria-disabled={pagina <= 1 || undefined}>
                        {TEXTOS.anterior}
                    </button>
                    <span>{TEXTOS.pagina(pagina, paginas)}</span>
                    <button type="button" className={base.boton} onClick={() => irAPagina(pagina + 1)} aria-disabled={pagina >= paginas || undefined}>
                        {TEXTOS.siguiente}
                    </button>
                </nav>
            )}
            {dialogo && (
                <AdminDialogoMotivo
                    titulo={TEXTOS.tituloLote(nElegidas)}
                    explicacion={TEXTOS.explicacionLote}
                    lista={muestra}
                    boton={TEXTOS.botonLote(nElegidas)}
                    onEnviar={marcarLote}
                    onCerrar={cerrarDialogo}
                />
            )}
        </section>
    );
}
