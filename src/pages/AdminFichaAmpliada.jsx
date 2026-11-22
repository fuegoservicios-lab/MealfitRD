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
// [P1-PLAN-LOTE-833 · 2026-09-29, ronda 1] Las 10 filas del grupo «Dispositivo» que manda el backend en `ajustes` viven en
// «Ajustes del dispositivo» (por plataforma, con SUS etiquetas): en la lista de grupos salían dos veces. Una marca
// `sin_marca` (hubo marcas, ninguna viva) dice «Ya no es de prueba» con su historial y se puede volver a marcar. Los valores
// crudos (`relleno`, `vista`, `android,web`, listas y objetos) se leen como texto.
import { useEffect, useId, useState } from 'react';
import {
    NOMBRE_MODO, cifra, fecha, fechaHora, nombreIdioma, nombrePais, nombresDePlataformas, pedirAdmin, usd,
} from '../utils/adminCuentas';
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
    ajustes: 'Ajustes',
    leyenda: 'Entre paréntesis, quién hizo el último cambio: la persona (desde la app), el coach o el sistema.',
    sinAjustes: 'Sin ajustes que mostrar.',
    estados: { encendido: 'Encendido', apagado: 'Apagado', automatico: 'Automático', sin_elegir: 'Sin elegir' },
    // `app` NO es «tú»: quien lee el panel es el admin y lo tomaría por sí mismo (corrección del controlador, 29-sep).
    origenes: { app: 'la persona', coach: 'el coach', sistema: 'el sistema' },
    cambiado: (f, quien) => (quien ? `Último cambio: ${f} (${quien})` : `Último cambio: ${f}`),
    dispositivo: 'Ajustes del dispositivo',
    sinDispositivo: 'La app todavía no ha informado los ajustes de ningún dispositivo.',
    informado: (plataforma, f) => `${plataforma} · informado el ${f}`,
    nombresPlataforma: { web: 'Web', ios: 'iOS', android: 'Android' },
    // Solo si la ficha no trae las filas «Dispositivo» del backend (que llevan SUS etiquetas, las del registro).
    claveDispositivo: {
        tema: 'Tema', notificaciones_permiso: 'Permiso de notificaciones', alertas_activadas: 'Alertas del dispositivo',
        analitica_vetada: 'Analítica vetada en el dispositivo', barra_plegada: 'Barra de pestañas plegada',
        unidad_altura: 'Unidad de altura', avatar_elegido: 'Avatar elegido', pwa: 'Instalada como app (PWA)',
        app_build: 'Versión de la app',
    },
    // El formulario siembra `ft` para todos: sin la nota, «ft» parecería una elección de la persona.
    notaDispositivo: { unidad_altura: '(por defecto ft si no la cambió)' },
    // Valores con nombre, por clave (la de un ajuste o la del dispositivo), con la forma que manda `ajustes_cuenta`. Lo que
    // no esté aquí sale tal cual.
    valores: {
        plan_mode: { plan: 'Plan', tracking: 'Seguimiento' },
        logging_preference: { auto_proxy: 'Automático', manual: 'Manual' },
        tema: { system: 'Automático (sistema)', light: 'Claro', dark: 'Oscuro' },
        notificaciones_permiso: { granted: 'Concedido', denied: 'Denegado', default: 'Sin preguntar', unsupported: 'No compatible' },
        super_personalization: { relleno: 'Relleno' },
        clinical_profile: { relleno: 'Relleno' },
        invitacion_al_plan: { vista: 'La vio, sin responder', descartada: 'Respondió «Ahora no»' },
        entro_con_apple: { 'sí': 'Sí', no: 'No' },
        hidratacion_apagada_sola: { 'sí': 'Sí', no: 'No' },
    },
    si: 'Sí',
    no: 'No',
    siEnFrase: 'sí',
    noEnFrase: 'no',
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
const MAX_TEXTO_VALOR = 120;
const PROFUNDIDAD_MAX = 3;
// El backend pone en `ajustes` también los del dispositivo; su sitio es «Ajustes del dispositivo», por plataforma.
const GRUPO_DISPOSITIVO = 'Dispositivo';
// Claves cuyo valor es una lista de plataformas («android,web»).
const CLAVES_DE_PLATAFORMAS = new Set(['plataformas', 'push_app']);
// En el dispositivo, un booleano que es un interruptor (se dice encendido/apagado, con su color); el resto, Sí/No.
const INTERRUPTORES_DISPOSITIVO = new Set(['alertas_activadas']);

const nombreOrigen = (o) => (o ? TEXTOS.origenes[o] || String(o) : null);

const recortar = (texto) => (texto.length > MAX_TEXTO_VALOR ? `${texto.slice(0, MAX_TEXTO_VALOR - 1)}…` : texto);

/** Una lista u objeto en texto que se lee («x, 1», «activo: no, hora: 08:00»); lo anidado, entre paréntesis. */
function textoDe(v, profundidad = 0) {
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'boolean') return v ? TEXTOS.siEnFrase : TEXTOS.noEnFrase;
    if (typeof v === 'number') return cifra(v, 2);
    if (typeof v === 'string') return v;
    if (profundidad >= PROFUNDIDAD_MAX) {
        try { return JSON.stringify(v); } catch { return String(v); }
    }
    const anidado = (x) => (x && typeof x === 'object' ? `(${textoDe(x, profundidad + 1)})` : textoDe(x, profundidad + 1));
    if (Array.isArray(v)) return v.length ? v.map(anidado).join(', ') : '—';
    if (typeof v === 'object') {
        const pares = Object.entries(v);
        return pares.length ? pares.map(([k, x]) => `${k}: ${anidado(x)}`).join(', ') : '—';
    }
    return String(v);
}

/** Un valor crudo (booleano, enumerado, cifra, lista…) en texto; nunca revienta con tipos raros. */
function valorLegible(clave, v) {
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'boolean') return v ? TEXTOS.estados.encendido : TEXTOS.estados.apagado;
    if (typeof v === 'string') {
        const nombres = TEXTOS.valores[clave];
        if (nombres && nombres[v]) return nombres[v];
        if (clave === 'locale') return nombreIdioma(v);
        if (clave === 'country') return nombrePais(v);
        if (CLAVES_DE_PLATAFORMAS.has(clave)) return nombresDePlataformas(v);
        return recortar(v);
    }
    if (typeof v === 'number') return cifra(v, 2);
    return recortar(textoDe(v));
}

/** Un valor que acompaña a un estado encendido/apagado (la hora de un recordatorio, las plataformas de un aviso…).
 *  Los recuentos no: un «2» suelto junto a «Encendido» no dice de qué. */
const detalleDe = (v) => v !== null && v !== undefined && v !== '' && typeof v !== 'boolean' && typeof v !== 'number';

function Dato({ etiqueta, valor, nota, alerta = false }) {
    return (
        <div className={styles.dato} data-dato="" data-alerta={alerta ? 'true' : undefined}>
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
    const plataformas = nombresDePlataformas(a.plataformas) || TEXTOS.ninguna;
    return (
        <section className={styles.bloque} aria-labelledby={idTitulo}>
            <h4 id={idTitulo} className={styles.titulo}>{TEXTOS.actividad}</h4>
            <div className={styles.datos}>
                <Dato etiqueta={TEXTOS.ultima} valor={a.ultima ? fechaHora(a.ultima) : TEXTOS.sinActividad} />
                <Dato etiqueta={TEXTOS.comidas} valor={cifra(a.comidas_total)} nota={TEXTOS.comidas30(cifra(a.comidas_30d))} />
                <Dato etiqueta={TEXTOS.diasActivos} valor={cifra(a.dias_activos_30d)} />
                <Dato etiqueta={TEXTOS.comidasPorDia} valor={cifra(a.comidas_por_dia_activo, 1)} />
                <Dato etiqueta={TEXTOS.planes} valor={cifra(a.planes)} />
                <Dato etiqueta={TEXTOS.bloques} valor={cifra(a.bloques_fallidos_30d)} alerta={Number(a.bloques_fallidos_30d) > 0} />
                <Dato etiqueta={TEXTOS.mensajes} valor={cifra(a.mensajes_coach)} />
                <Dato etiqueta={TEXTOS.pulgares} valor={cifra(a.pulgares_abajo)} alerta={Number(a.pulgares_abajo) > 0} />
                <Dato etiqueta={TEXTOS.escaneos} valor={cifra(a.escaneos)} />
                <Dato etiqueta={TEXTOS.gasto} valor={usd(a.gasto_ia_30d_usd)} />
                <Dato etiqueta={TEXTOS.agua} valor={cifra(a.dias_con_agua_30d)} />
                <Dato etiqueta={TEXTOS.peso} valor={cifra(a.registros_peso)} />
                <Dato etiqueta={TEXTOS.avisos} valor={cifra(a.avisos_abiertos)} alerta={Number(a.avisos_abiertos) > 0} />
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

function Estado({ ajuste: a }) {
    if (a.estado !== 'valor' && TEXTOS.estados[a.estado]) {
        const chip = <span className={styles.chip} data-estado={a.estado}>{TEXTOS.estados[a.estado]}</span>;
        if (!detalleDe(a.valor)) return chip;
        return (
            <span className={styles.estadoConDetalle}>
                {chip}
                <span className={styles.detalle} data-valor="">{valorLegible(a.clave, a.valor)}</span>
            </span>
        );
    }
    // Un valor (enumerado, cifra…) o un estado que el panel aún no conoce: se enseña tal cual, sin color.
    const texto = a.estado === 'valor' ? valorLegible(a.clave, a.valor) : String(a.estado ?? '—');
    return <span className={styles.valor} data-estado="valor" data-valor="">{texto}</span>;
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

function Plataforma({ plataforma, ajustes, etiquetas }) {
    const id = useId();
    const nombre = TEXTOS.nombresPlataforma[plataforma] || plataforma;
    const conocidas = Object.keys(TEXTOS.claveDispositivo).filter((k) => k in ajustes);
    const otras = Object.keys(ajustes).filter((k) => k !== 'at' && !(k in TEXTOS.claveDispositivo));
    const etiqueta = (k) => etiquetas[k] || TEXTOS.claveDispositivo[k] || k;
    return (
        <section className={styles.plataforma} aria-labelledby={id}>
            <h6 id={id} className={styles.plataformaTitulo}>{ajustes.at ? TEXTOS.informado(nombre, fecha(ajustes.at)) : nombre}</h6>
            <ul className={styles.filas}>
                {[...conocidas, ...otras].map((k) => (
                    <li key={k} className={styles.fila}>
                        <span className={styles.filaEtiqueta}>
                            {etiqueta(k)}
                            {TEXTOS.notaDispositivo[k] && <span className={styles.notaEnLinea}>{` ${TEXTOS.notaDispositivo[k]}`}</span>}
                        </span>
                        {valorDispositivo(k, ajustes[k])}
                    </li>
                ))}
            </ul>
        </section>
    );
}

function AjustesDispositivo({ dispositivo, etiquetas }) {
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
                    {plataformas.map((p) => <Plataforma key={p} plataforma={p} ajustes={dispositivo[p]} etiquetas={etiquetas} />)}
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
        const controller = new AbortController();
        (async () => {
            try {
                const datos = await pedirAdmin(
                    `/api/admin/cuentas/${encodeURIComponent(userId)}/ajustes/historial?dias=${dias}`,
                    undefined,
                    { signal: controller.signal },
                );
                if (!vivo) return;
                setCambios(Array.isArray(datos?.cambios) ? datos.cambios : []);
                setEstado('listo');
            } catch {
                if (vivo && !controller.signal.aborted) setEstado('error');
            }
        })();
        return () => { vivo = false; controller.abort(); };
    }, [abierto, dias, userId]);

    const alternar = () => {
        if (!abierto) setEstado('cargando');
        setAbierto(!abierto);
    };
    const elegirDias = (d) => { if (d === dias) return; setEstado('cargando'); setDias(d); };

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
    const etiquetasDispositivo = {};
    for (const a of ficha.ajustes) {
        if (!a || typeof a !== 'object') continue;
        if (a.grupo === GRUPO_DISPOSITIVO) {
            // Su sitio es la sección por plataforma (aquí salían dos veces); de la fila solo se toma la etiqueta.
            if (a.clave && a.etiqueta) etiquetasDispositivo[a.clave] = a.etiqueta;
            continue;
        }
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
            <AjustesDispositivo dispositivo={dispositivo} etiquetas={etiquetasDispositivo} />
            <CambiosAjustes userId={ficha.user_id} />
        </section>
    );
}

/**
 * Los bloques ampliados de la ficha (`Actividad` y `Ajustes`).
 */
export default function AdminFichaAmpliada({ ficha }) {
    const actividad = ficha.actividad && typeof ficha.actividad === 'object' ? ficha.actividad : null;
    const hayAjustes = Array.isArray(ficha.ajustes);
    if (!actividad && !hayAjustes) return null;
    return (
        <>
            {actividad && <BloqueActividad actividad={actividad} />}
            {hayAjustes && <BloqueAjustes ficha={ficha} />}
        </>
    );
}
