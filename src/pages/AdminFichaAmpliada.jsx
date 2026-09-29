// frontend/src/pages/AdminFichaAmpliada.jsx
// [P1-PLAN-LOTE-833 · 2026-09-29] La ficha de una cuenta con el interruptor de cuentas de prueba encendido (spec
// docs/superpowers/specs/2026-09-29-admin-cuentas-actividad-pruebas-design.md §4.2, §4.5, §13.1-§13.6; contratos 3-5
// y 7). Bajo la ficha de hoy (plan, suscripción, créditos, regalos) van tres bloques:
//   · «Actividad»: cifras y el embudo con sus fechas. Solo números, NUNCA contenido.
//   · «Cuenta de prueba»: desde cuándo, quién la marcó y por qué, si la persona ya vio el aviso y el historial; marcar o
//     quitar con motivo. Si la persona salió ella misma, volver a marcarla se confirma APARTE, en un segundo diálogo
//     («La persona me pidió volver»). «Ver detalle» abre el detalle como estado de la página (sin rutas nuevas).
//   · «Ajustes»: por grupo, el estado en PALABRA y color (nunca solo color), cuándo cambió y quién; los del
//     dispositivo, por plataforma; el historial de cambios se pide al abrir «Ver cambios».
// Cada bloque sale solo si la ficha lo trae: con el interruptor apagado no trae ninguno y la ficha queda idéntica a la
// del lote 774. Interno —solo el dueño, solo español—: los textos fijos viven en TEXTOS.
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import AdminDialogoMotivo from './AdminDialogoMotivo';
import { NOMBRE_MODO, cifra, fecha, fechaHora, nombreIdioma, nombrePais, pedirAdmin, usd } from '../utils/adminCuentas';
import base from './AdminCuentas.module.css';
import styles from './AdminFichaAmpliada.module.css';

// [I18N-EXEMPT: panel interno del dueño, solo español]
const TEXTOS = {
    actividad: 'Actividad',
    ultima: 'Última actividad',
    sinActividad: 'Sin actividad',
    comidas: 'Comidas registradas',
    comidas30: (n) => `${n} en los últimos 30 días`,
    diasActivos: 'Días activos (30 días)',
    comidasPorDia: 'Comidas por día activo',
    planes: 'Planes generados',
    bloques: 'Bloques de plan fallidos (30 días)',
    mensajes: 'Mensajes al coach',
    pulgares: '👎 al coach',
    escaneos: 'Escaneos',
    gasto: 'Gasto de IA (30 días)',
    agua: 'Días con agua (30 días)',
    peso: 'Registros de peso',
    avisos: 'Avisos abiertos',
    plataformas: 'Plataformas',
    modo: 'Modo',
    idioma: 'Idioma',
    pais: 'País',
    ninguna: 'Ninguna',
    sinElegir: 'Sin elegir',
    embudo: 'Embudo',
    todaviaNo: 'Todavía no',
    prueba: 'Cuenta de prueba',
    noEs: 'No es una cuenta de prueba.',
    chipPrueba: 'Prueba',
    chipPendiente: 'Aviso pendiente',
    desde: (f) => `Cuenta de prueba desde el ${f}`,
    marcadaPor: (quien) => `Marcada por ${quien}`,
    motivo: (m) => `Motivo: «${m}»`,
    avisoVisto: (f) => `La persona vio el aviso el ${f}.`,
    avisoPendiente: 'Esperando a que vea el aviso en la app.',
    avisoNoVisto: 'La persona todavía no ha visto el aviso en la app.',
    historial: 'Historial de la marca',
    vigente: 'vigente',
    tramo: (desde, hasta) => `Del ${desde} al ${hasta}`,
    tramoVigente: (desde) => `Desde el ${desde}`,
    salioElla: 'salió la propia persona',
    quitadaPorEquipo: 'la quitó el equipo',
    motivoQuitar: (m) => `al quitarla: «${m}»`,
    marcar: 'Marcar como cuenta de prueba',
    quitar: 'Quitar marca',
    verDetalle: 'Ver detalle',
    dialogoMarcar: {
        titulo: 'Marcar como cuenta de prueba',
        explicacion: 'La persona verá un aviso en la app. Hasta que lo vea, el detalle de su cuenta sigue cerrado; los números y los ajustes no cambian.',
        boton: 'Marcar como prueba',
    },
    dialogoVuelta: {
        titulo: 'Esta persona salió ella misma del modo de prueba',
        explicacion: 'Quitó la marca desde la app. Vuelve a marcarla solo si ella te pidió volver: verá otra vez el aviso.',
        confirmacion: 'La persona me pidió volver',
        boton: 'Volver a marcarla',
    },
    dialogoQuitar: {
        titulo: 'Quitar la marca de prueba',
        explicacion: 'El equipo deja de ver su actividad completa. Los números y los ajustes siguen a la vista.',
        boton: 'Quitar la marca',
    },
    errores: {
        ya_marcada: 'Esta cuenta ya estaba marcada como de prueba.',
        sin_marca: 'Esta cuenta ya no tenía la marca.',
        no_existe: 'Esta cuenta ya no existe.',
        salio_ella: 'La persona salió ella misma: confirma que te pidió volver.',
        motivo: 'El motivo debe tener entre 3 y 300 caracteres.',
        generico: 'No se pudo guardar; no se hizo ningún cambio.',
    },
    ajustes: 'Ajustes',
    leyenda: 'Entre paréntesis, quién hizo el último cambio: la persona (desde la app), el coach o el sistema.',
    sinAjustes: 'Sin ajustes que mostrar.',
    estados: { encendido: 'Encendido', apagado: 'Apagado', automatico: 'Automático', sin_elegir: 'Sin elegir', relleno: 'Relleno' },
    // `app` NO es «tú»: quien lee el panel es el admin y lo tomaría por sí mismo (corrección del controlador, 29-sep).
    origenes: { app: 'la persona', coach: 'el coach', sistema: 'el sistema' },
    cambiado: (f, quien) => (quien ? `Último cambio: ${f} (${quien})` : `Último cambio: ${f}`),
    dispositivo: 'Ajustes del dispositivo',
    sinDispositivo: 'La app todavía no ha informado los ajustes de ningún dispositivo.',
    informado: (plataforma, f) => `${plataforma} · informado el ${f}`,
    nombresPlataforma: { web: 'Web', ios: 'iOS', android: 'Android' },
    claveDispositivo: {
        tema: 'Tema', notificaciones_permiso: 'Permiso de notificaciones', alertas_activadas: 'Alertas del dispositivo',
        analitica_vetada: 'Analítica vetada en el dispositivo', barra_plegada: 'Barra de pestañas plegada',
        unidad_altura: 'Unidad de altura', avatar_elegido: 'Avatar elegido', pwa: 'Instalada como app (PWA)',
        app_build: 'Versión de la app',
    },
    // El formulario siembra `ft` para todos: sin la nota, «ft» parecería una elección de la persona.
    notaDispositivo: { unidad_altura: '(por defecto ft si no la cambió)' },
    // Valores con nombre, por clave (la de un ajuste o la del dispositivo). Lo que no esté aquí sale tal cual.
    valores: {
        plan_mode: { plan: 'Plan', tracking: 'Seguimiento' },
        tema: { system: 'Automático (sistema)', light: 'Claro', dark: 'Oscuro' },
        notificaciones_permiso: { granted: 'Concedido', denied: 'Denegado', default: 'Sin preguntar', unsupported: 'No compatible' },
    },
    si: 'Sí',
    no: 'No',
    verCambios: 'Ver cambios',
    ocultarCambios: 'Ocultar cambios',
    periodoCambios: 'Periodo de los cambios',
    dias: (d) => `${d} días`,
    listaCambios: 'Cambios de ajustes',
    cambio: (etiqueta, antes, despues, quien) => `${etiqueta}: ${antes} → ${despues}${quien ? ` (${quien})` : ''}`,
    cargandoCambios: 'Cargando los cambios…',
    sinCambios: 'Sin cambios en este periodo.',
    errorCambios: 'No se pudieron cargar los cambios.',
    pasos: [
        ['alta', 'Alta'], ['formulario', 'Formulario'], ['primer_plan', 'Primer plan'], ['primera_comida', 'Primera comida'],
        ['primer_mensaje', 'Primer mensaje al coach'], ['primer_escaneo', 'Primer escaneo'],
    ],
};

const ORDEN_PLATAFORMAS = ['web', 'ios', 'android'];
const PERIODOS_CAMBIOS = [30, 90, 365];
const MAX_TEXTO_VALOR = 80;
// En el dispositivo, un booleano que es un interruptor (se dice encendido/apagado, con su color); el resto, Sí/No.
const INTERRUPTORES_DISPOSITIVO = new Set(['alertas_activadas']);

const nombreOrigen = (o) => (o ? TEXTOS.origenes[o] || String(o) : null);

/** Un valor crudo (booleano, enumerado, cifra, lista…) en texto; nunca revienta con tipos raros. */
function valorLegible(clave, v) {
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'boolean') return v ? TEXTOS.estados.encendido : TEXTOS.estados.apagado;
    if (typeof v === 'string') {
        const nombres = TEXTOS.valores[clave];
        if (nombres && nombres[v]) return nombres[v];
        if (clave === 'locale') return nombreIdioma(v);
        if (clave === 'country') return nombrePais(v);
        return v;
    }
    if (typeof v === 'number') return cifra(v, 2);
    let texto;
    try { texto = JSON.stringify(v); } catch { texto = String(v); }
    return texto.length > MAX_TEXTO_VALOR ? `${texto.slice(0, MAX_TEXTO_VALOR - 1)}…` : texto;
}

function mensajeDe(err) {
    if (err?.detalle && TEXTOS.errores[err.detalle]) return TEXTOS.errores[err.detalle];
    if (err?.status === 422) return TEXTOS.errores.motivo;
    return err?.message || TEXTOS.errores.generico;
}

function Dato({ etiqueta, valor, nota }) {
    return (
        <div className={styles.dato} data-dato="">
            <span className={styles.datoEtiqueta}>{etiqueta}</span>
            <span className={styles.datoValor}>{valor}</span>
            {nota && <span className={styles.datoNota}>{nota}</span>}
        </div>
    );
}

function BloqueActividad({ actividad: a }) {
    const idTitulo = useId();
    const idEmbudo = useId();
    const embudo = a.embudo && typeof a.embudo === 'object' ? a.embudo : {};
    const plataformas = Array.isArray(a.plataformas) && a.plataformas.length > 0
        ? a.plataformas.map((p) => TEXTOS.nombresPlataforma[p] || p).join(', ')
        : TEXTOS.ninguna;
    return (
        <section className={styles.bloque} aria-labelledby={idTitulo}>
            <h4 id={idTitulo} className={styles.titulo}>{TEXTOS.actividad}</h4>
            <div className={styles.datos}>
                <Dato etiqueta={TEXTOS.ultima} valor={a.ultima ? fechaHora(a.ultima) : TEXTOS.sinActividad} />
                <Dato etiqueta={TEXTOS.comidas} valor={cifra(a.comidas_total)} nota={TEXTOS.comidas30(cifra(a.comidas_30d))} />
                <Dato etiqueta={TEXTOS.diasActivos} valor={cifra(a.dias_activos_30d)} />
                <Dato etiqueta={TEXTOS.comidasPorDia} valor={cifra(a.comidas_por_dia_activo, 1)} />
                <Dato etiqueta={TEXTOS.planes} valor={cifra(a.planes)} />
                <Dato etiqueta={TEXTOS.bloques} valor={cifra(a.bloques_fallidos_30d)} />
                <Dato etiqueta={TEXTOS.mensajes} valor={cifra(a.mensajes_coach)} />
                <Dato etiqueta={TEXTOS.pulgares} valor={cifra(a.pulgares_abajo)} />
                <Dato etiqueta={TEXTOS.escaneos} valor={cifra(a.escaneos)} />
                <Dato etiqueta={TEXTOS.gasto} valor={usd(a.gasto_ia_30d_usd)} />
                <Dato etiqueta={TEXTOS.agua} valor={cifra(a.dias_con_agua_30d)} />
                <Dato etiqueta={TEXTOS.peso} valor={cifra(a.registros_peso)} />
                <Dato etiqueta={TEXTOS.avisos} valor={cifra(a.avisos_abiertos)} />
                <Dato etiqueta={TEXTOS.plataformas} valor={plataformas} />
                <Dato etiqueta={TEXTOS.modo} valor={NOMBRE_MODO[a.modo] || a.modo || TEXTOS.sinElegir} />
                <Dato etiqueta={TEXTOS.idioma} valor={nombreIdioma(a.idioma) || TEXTOS.sinElegir} />
                <Dato etiqueta={TEXTOS.pais} valor={nombrePais(a.pais) || TEXTOS.sinElegir} />
            </div>
            <h5 id={idEmbudo} className={styles.subtitulo}>{TEXTOS.embudo}</h5>
            <ol className={styles.embudo} aria-labelledby={idEmbudo}>
                {TEXTOS.pasos.map(([clave, etiqueta]) => {
                    const at = embudo[clave] || null;
                    return (
                        <li key={clave} className={styles.paso} data-hecho={at ? 'true' : 'false'}>
                            <span className={styles.pasoMarca} aria-hidden="true">{at ? '✓' : '○'}</span>
                            <span className={styles.pasoEtiqueta}>{etiqueta}</span>
                            <span className={styles.pasoFecha}>{at ? fecha(at) : TEXTOS.todaviaNo}</span>
                        </li>
                    );
                })}
            </ol>
        </section>
    );
}

function EntradaHistorial({ h }) {
    const tramo = h.hasta ? TEXTOS.tramo(fecha(h.desde), fecha(h.hasta)) : TEXTOS.tramoVigente(fecha(h.desde));
    const partes = [tramo];
    if (!h.hasta) partes.push(TEXTOS.vigente);
    if (h.motivo) partes.push(TEXTOS.motivo(h.motivo));
    if (h.marcada_por) partes.push(TEXTOS.marcadaPor(h.marcada_por));
    if (h.hasta) partes.push(h.quitada_por_la_persona ? TEXTOS.salioElla : TEXTOS.quitadaPorEquipo);
    if (h.motivo_quitar) partes.push(TEXTOS.motivoQuitar(h.motivo_quitar));
    return <li className={styles.marca}>{partes.join(' · ')}</li>;
}

function BloquePrueba({ ficha, onCambio, onVerDetalle, refVerDetalle }) {
    const idTitulo = useId();
    const idHistorial = useId();
    const [dialogo, setDialogo] = useState(null);     // null | { tipo: 'marcar' | 'vuelta' | 'quitar', motivo? }
    const tituloRef = useRef(null);
    const enfocarTitulo = useRef(false);
    const cerrar = useCallback(() => setDialogo(null), []);
    const p = ficha.prueba;
    const uid = ficha.user_id;

    // Tras marcar o quitar, el botón que abrió el diálogo ya no existe (cambia por el contrario): el foco va al título
    // del bloque, que se pinta de nuevo con el estado que acaba de guardarse.
    useEffect(() => {
        if (!enfocarTitulo.current || dialogo) return;
        enfocarTitulo.current = false;
        tituloRef.current?.focus();
    });

    const hecho = (datos) => {
        enfocarTitulo.current = true;
        setDialogo(null);
        onCambio?.(datos?.cuenta || null);
    };
    const marcar = async (motivo, confirmarVuelta) => {
        let datos;
        try {
            datos = await pedirAdmin(`/api/admin/cuentas/${uid}/prueba`, { motivo, confirmar_vuelta: confirmarVuelta });
        } catch (err) {
            // La persona salió ella misma: volver a marcarla se confirma aparte, en un segundo diálogo.
            if (err?.detalle === 'salio_ella' && !confirmarVuelta) { setDialogo({ tipo: 'vuelta', motivo }); return; }
            throw new Error(mensajeDe(err));
        }
        hecho(datos);
    };
    const quitar = async (motivo) => {
        let datos;
        try {
            datos = await pedirAdmin(`/api/admin/cuentas/${uid}/prueba/quitar`, { motivo });
        } catch (err) {
            throw new Error(mensajeDe(err));
        }
        hecho(datos);
    };

    let aviso = null;
    if (p) {
        if (p.estado === 'aviso_pendiente') aviso = <li className={styles.pendiente}>{TEXTOS.avisoPendiente}</li>;
        else if (p.aviso_visto_at) aviso = <li>{TEXTOS.avisoVisto(fecha(p.aviso_visto_at))}</li>;
        else aviso = <li>{TEXTOS.avisoNoVisto}</li>;
    }
    const historial = Array.isArray(p?.historial) ? p.historial : [];

    return (
        <section className={styles.bloque} aria-labelledby={idTitulo}>
            <h4 id={idTitulo} ref={tituloRef} tabIndex={-1} className={styles.titulo}>{TEXTOS.prueba}</h4>
            {!p ? (
                <>
                    <p className={styles.texto}>{TEXTOS.noEs}</p>
                    <div className={styles.acciones}>
                        <button type="button" className={base.boton} onClick={() => setDialogo({ tipo: 'marcar' })}>{TEXTOS.marcar}</button>
                    </div>
                </>
            ) : (
                <>
                    <div className={styles.etiquetas}>
                        <span className={styles.chip} data-tono="prueba">{TEXTOS.chipPrueba}</span>
                        {p.estado === 'aviso_pendiente' && <span className={styles.chip} data-tono="pendiente">{TEXTOS.chipPendiente}</span>}
                    </div>
                    <ul className={styles.hechos}>
                        <li>{TEXTOS.desde(fecha(p.desde))}</li>
                        {p.marcada_por && <li>{TEXTOS.marcadaPor(p.marcada_por)}</li>}
                        {p.motivo && <li>{TEXTOS.motivo(p.motivo)}</li>}
                        {aviso}
                    </ul>
                    <div className={styles.acciones}>
                        <button
                            ref={refVerDetalle}
                            type="button"
                            className={base.primario}
                            onClick={() => onVerDetalle?.({ user_id: uid, email: ficha.email })}
                        >
                            {TEXTOS.verDetalle}
                        </button>
                        <button type="button" className={base.boton} onClick={() => setDialogo({ tipo: 'quitar' })}>{TEXTOS.quitar}</button>
                    </div>
                    {historial.length > 0 && (
                        <>
                            <h5 id={idHistorial} className={styles.subtitulo}>{TEXTOS.historial}</h5>
                            <ul className={styles.historial} aria-labelledby={idHistorial}>
                                {historial.map((h, i) => <EntradaHistorial key={`${h.desde}-${i}`} h={h} />)}
                            </ul>
                        </>
                    )}
                </>
            )}
            {dialogo?.tipo === 'marcar' && (
                <AdminDialogoMotivo
                    key="marcar"
                    {...TEXTOS.dialogoMarcar}
                    onEnviar={(motivo) => marcar(motivo, false)}
                    onCerrar={cerrar}
                />
            )}
            {dialogo?.tipo === 'vuelta' && (
                <AdminDialogoMotivo
                    key="vuelta"
                    {...TEXTOS.dialogoVuelta}
                    motivoInicial={dialogo.motivo}
                    onEnviar={(motivo) => marcar(motivo, true)}
                    onCerrar={cerrar}
                />
            )}
            {dialogo?.tipo === 'quitar' && (
                <AdminDialogoMotivo key="quitar" {...TEXTOS.dialogoQuitar} onEnviar={quitar} onCerrar={cerrar} />
            )}
        </section>
    );
}

function Estado({ ajuste: a }) {
    if (a.estado !== 'valor' && TEXTOS.estados[a.estado]) {
        return <span className={styles.chip} data-estado={a.estado}>{TEXTOS.estados[a.estado]}</span>;
    }
    // Un valor (enumerado, cifra…) o un estado que el panel aún no conoce: se enseña tal cual, sin color.
    const texto = a.estado === 'valor' ? valorLegible(a.clave, a.valor) : String(a.estado ?? '—');
    return <span className={styles.valor} data-estado="valor">{texto}</span>;
}

function GrupoAjustes({ nombre, ajustes }) {
    const id = useId();
    return (
        <section className={styles.grupo} aria-labelledby={id}>
            <h5 id={id} className={styles.subtitulo}>{nombre}</h5>
            <ul className={styles.filas}>
                {ajustes.map((a, i) => (
                    <li key={`${a.clave}-${i}`} className={styles.fila}>
                        <span className={styles.filaEtiqueta}>{a.etiqueta || a.clave}</span>
                        <Estado ajuste={a} />
                        {a.cambiado_at && <span className={styles.filaNota}>{TEXTOS.cambiado(fecha(a.cambiado_at), nombreOrigen(a.origen))}</span>}
                    </li>
                ))}
            </ul>
        </section>
    );
}

function valorDispositivo(clave, v) {
    if (typeof v === 'boolean') {
        if (INTERRUPTORES_DISPOSITIVO.has(clave)) {
            const estado = v ? 'encendido' : 'apagado';
            return <span className={styles.chip} data-estado={estado}>{TEXTOS.estados[estado]}</span>;
        }
        return <span className={styles.valor}>{v ? TEXTOS.si : TEXTOS.no}</span>;
    }
    return <span className={styles.valor}>{valorLegible(clave, v)}</span>;
}

function Plataforma({ plataforma, ajustes }) {
    const id = useId();
    const nombre = TEXTOS.nombresPlataforma[plataforma] || plataforma;
    const conocidas = Object.keys(TEXTOS.claveDispositivo).filter((k) => k in ajustes);
    const otras = Object.keys(ajustes).filter((k) => k !== 'at' && !(k in TEXTOS.claveDispositivo));
    return (
        <section className={styles.plataforma} aria-labelledby={id}>
            <h6 id={id} className={styles.plataformaTitulo}>{ajustes.at ? TEXTOS.informado(nombre, fecha(ajustes.at)) : nombre}</h6>
            <ul className={styles.filas}>
                {[...conocidas, ...otras].map((k) => (
                    <li key={k} className={styles.fila}>
                        <span className={styles.filaEtiqueta}>
                            {TEXTOS.claveDispositivo[k] || k}
                            {TEXTOS.notaDispositivo[k] && <span className={styles.notaEnLinea}>{` ${TEXTOS.notaDispositivo[k]}`}</span>}
                        </span>
                        {valorDispositivo(k, ajustes[k])}
                    </li>
                ))}
            </ul>
        </section>
    );
}

function AjustesDispositivo({ dispositivo }) {
    const id = useId();
    const plataformas = Object.keys(dispositivo)
        .filter((k) => dispositivo[k] && typeof dispositivo[k] === 'object')
        .sort((x, y) => {
            const ix = ORDEN_PLATAFORMAS.indexOf(x);
            const iy = ORDEN_PLATAFORMAS.indexOf(y);
            return (ix === -1 ? 99 : ix) - (iy === -1 ? 99 : iy);
        });
    return (
        <section className={styles.grupo} aria-labelledby={id}>
            <h5 id={id} className={styles.subtitulo}>{TEXTOS.dispositivo}</h5>
            {plataformas.length === 0 ? <p className={styles.texto}>{TEXTOS.sinDispositivo}</p> : (
                <div className={styles.plataformas}>
                    {plataformas.map((p) => <Plataforma key={p} plataforma={p} ajustes={dispositivo[p]} />)}
                </div>
            )}
        </section>
    );
}

function CambiosAjustes({ userId }) {
    const idPanel = useId();
    const idPeriodo = useId();
    const [abierto, setAbierto] = useState(false);
    const [dias, setDias] = useState(90);
    const [estado, setEstado] = useState('inicio');   // inicio | cargando | listo | error
    const [cambios, setCambios] = useState([]);

    // Contrato 7: se pide al abrir el panel (y al cambiar el periodo), nunca antes: cada vista queda en el rastro.
    useEffect(() => {
        if (!abierto) return undefined;
        let vivo = true;
        (async () => {
            try {
                const datos = await pedirAdmin(`/api/admin/cuentas/${userId}/ajustes/historial?dias=${dias}`);
                if (!vivo) return;
                setCambios(Array.isArray(datos?.cambios) ? datos.cambios : []);
                setEstado('listo');
            } catch {
                if (vivo) setEstado('error');
            }
        })();
        return () => { vivo = false; };
    }, [abierto, dias, userId]);

    const alternar = () => {
        if (!abierto) setEstado('cargando');
        setAbierto(!abierto);
    };
    const elegirDias = (d) => { setEstado('cargando'); setDias(d); };

    return (
        <div className={styles.cambios}>
            <button type="button" className={base.boton} aria-expanded={abierto} aria-controls={idPanel} onClick={alternar}>
                {abierto ? TEXTOS.ocultarCambios : TEXTOS.verCambios}
            </button>
            <div id={idPanel} className={styles.panelCambios} hidden={!abierto}>
                {abierto && (
                    <>
                        <div className={styles.periodo}>
                            <label htmlFor={idPeriodo} className={base.etiqueta}>{TEXTOS.periodoCambios}</label>
                            <select id={idPeriodo} className={base.input} value={dias} onChange={(e) => elegirDias(Number(e.target.value))}>
                                {PERIODOS_CAMBIOS.map((d) => <option key={d} value={d}>{TEXTOS.dias(d)}</option>)}
                            </select>
                        </div>
                        {estado === 'cargando' && <p className={styles.estadoCambios} role="status">{TEXTOS.cargandoCambios}</p>}
                        {estado === 'error' && <p className={base.error} role="alert">{TEXTOS.errorCambios}</p>}
                        {estado === 'listo' && cambios.length === 0 && <p className={styles.estadoCambios}>{TEXTOS.sinCambios}</p>}
                        {estado === 'listo' && cambios.length > 0 && (
                            <ul className={styles.listaCambios} aria-label={TEXTOS.listaCambios}>
                                {cambios.map((c, i) => (
                                    <li key={`${c.at}-${c.clave}-${i}`} className={styles.cambio}>
                                        <time className={styles.cambioFecha} dateTime={c.at}>{fechaHora(c.at)}</time>{' '}
                                        <span>{TEXTOS.cambio(c.etiqueta || c.clave, valorLegible(c.clave, c.antes), valorLegible(c.clave, c.despues), nombreOrigen(c.origen))}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

function BloqueAjustes({ ficha }) {
    const idTitulo = useId();
    const grupos = [];
    for (const a of ficha.ajustes) {
        if (!a || typeof a !== 'object') continue;
        const nombre = a.grupo || TEXTOS.ajustes;
        let g = grupos.find((x) => x.nombre === nombre);
        if (!g) { g = { nombre, ajustes: [] }; grupos.push(g); }
        g.ajustes.push(a);
    }
    const dispositivo = ficha.ajustes_dispositivo && typeof ficha.ajustes_dispositivo === 'object' ? ficha.ajustes_dispositivo : {};
    return (
        <section className={styles.bloque} aria-labelledby={idTitulo}>
            <h4 id={idTitulo} className={styles.titulo}>{TEXTOS.ajustes}</h4>
            <p className={styles.leyenda}>{TEXTOS.leyenda}</p>
            {grupos.length === 0 ? <p className={styles.texto}>{TEXTOS.sinAjustes}</p> : (
                <div className={styles.grupos}>
                    {grupos.map((g) => <GrupoAjustes key={g.nombre} nombre={g.nombre} ajustes={g.ajustes} />)}
                </div>
            )}
            <AjustesDispositivo dispositivo={dispositivo} />
            <CambiosAjustes userId={ficha.user_id} />
        </section>
    );
}

/**
 * Los bloques nuevos de la ficha. `onCambio(cuenta)` recibe la ficha que devuelve el servidor tras marcar o quitar;
 * `onVerDetalle({user_id, email})` abre el detalle de prueba; `refVerDetalle` es el botón al que vuelve el foco.
 */
export default function AdminFichaAmpliada({ ficha, onCambio, onVerDetalle, refVerDetalle }) {
    const actividad = ficha.actividad && typeof ficha.actividad === 'object' ? ficha.actividad : null;
    const hayAjustes = Array.isArray(ficha.ajustes);
    const hayPrueba = Object.prototype.hasOwnProperty.call(ficha, 'prueba');
    if (!actividad && !hayAjustes && !hayPrueba) return null;
    return (
        <>
            {actividad && <BloqueActividad actividad={actividad} />}
            {hayPrueba && <BloquePrueba ficha={ficha} onCambio={onCambio} onVerDetalle={onVerDetalle} refVerDetalle={refVerDetalle} />}
            {hayAjustes && <BloqueAjustes ficha={ficha} />}
        </>
    );
}
