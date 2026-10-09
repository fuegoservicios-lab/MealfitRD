// frontend/src/pages/AdminCuentas.jsx
// [P1-PLAN-LOTE-775 · 2026-09-28] Panel admin · Cuentas (spec docs/superpowers/specs/2026-09-28-admin-cuentas-regalos-
// design.md §4.2): buscar una cuenta por su correo EXACTO (no hay lista), ver su ficha y regalarle créditos o un plan
// de cortesía, o revertir un regalo. Cada acción pide un motivo y enseña su efecto antes de aplicarse; el servidor la
// anota antes de escribir. Interno —solo el dueño, solo español—: los textos fijos viven en TEXTOS.
// [P1-PLAN-LOTE-833 · 2026-09-29] Con el interruptor de cuentas de prueba encendido, encima del buscador exacto (que se
// pinta igual desde el primer render) va la lista de todas las cuentas (`AdminCuentasLista`, que se pide ella misma: un
// 404 deja el panel como hoy), la ficha gana sus bloques nuevos (`AdminFichaAmpliada`) y el detalle de una cuenta de
// prueba se abre como ESTADO de esta página (`detalle`), sin rutas nuevas: `/admin` es una ruta exacta.
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { fetchWithAuth } from '../config/api';
import { formatDate } from '../i18n';
import { useModalAccessibility } from '../hooks/useModalAccessibility';
import { ultimoDiaDeRegalo } from '../utils/regalosCuenta';
import AdminCuentasLista from './AdminCuentasLista';
import AdminFichaAmpliada from './AdminFichaAmpliada';
import AdminPruebaDetalle from './AdminPruebaDetalle';
import styles from './AdminCuentas.module.css';
import { useAdminLoading, useAdminNavigationState } from '../hooks/useAdminNavigation';
import { IOS_FREE_GENERATION, IOS_FREE_COACH } from '../utils/iosFree';

// [I18N-EXEMPT: panel interno del dueño, solo español]
const TEXTOS = {
    correo: 'Correo de la cuenta',
    ayudaBusqueda: 'Escribe el correo completo; no hay lista de cuentas. Cada búsqueda queda anotada.',
    ayudaConLista: 'Si tienes el correo exacto, búscalo aquí. Cada búsqueda queda anotada.',
    volverLista: 'Volver a la lista',
    abriendo: 'Abriendo la cuenta…',
    yaNoExiste: 'Esa cuenta ya no existe.',
    detalleDe: (correo) => `Detalle de ${correo}`,
    volverFicha: 'Volver a la ficha',
    buscar: 'Buscar',
    buscando: 'Buscando…',
    noExiste: 'No hay ninguna cuenta con ese correo.',
    cuenta: (correo) => `Cuenta ${correo}`,
    alta: (f) => `Alta: ${f}`,
    plan: 'Plan',
    paga: (p) => `paga ${p}`,
    cortesiaHasta: (f) => `Cortesía hasta el ${f}`,
    cortesiaSinFin: 'Cortesía sin fecha de fin',
    suscripcion: 'Suscripción',
    conPaypal: (estado, fin) => `PayPal · ${estado || 'sin estado'}${fin ? ` · hasta el ${fin}` : ''}`,
    sinPaypal: 'Sin suscripción de PayPal',
    creditos: 'Créditos de planes este mes',
    coach: 'Mensajes del coach este mes',
    deRegalo: (n) => `incluye +${n} de regalo`,
    sinTope: 'Sin tope',
    regalarCreditos: 'Regalar créditos',
    recargar: 'Recargar al completo',
    cortesia: 'Plan de cortesía',
    ningunPlanMejor: 'Ya tiene el plan más alto.',
    historial: 'Historial de regalos',
    sinHistorial: 'Todavía no se le ha regalado nada.',
    lineaRegalo: (estado, hasta, motivo) => `${estado} · ${hasta ? `hasta el ${hasta}` : 'sin fecha de fin'} · «${motivo}»`,
    estado: { vigente: 'Vigente', caducado: 'Caducado', revertido: 'Revertido' },
    revertir: 'Revertir',
    esAdmin: 'Es una cuenta de administración: no se le regala nada.',
    hecho: 'Cambio guardado y anotado.',
    tituloCreditos: 'Regalar créditos',
    tituloRecargar: 'Recargar al completo',
    tituloCortesia: 'Dar un plan de cortesía',
    tituloRevertir: 'Revertir un regalo',
    medidor: 'Qué',
    planes: 'Créditos de planes',
    mensajes: 'Mensajes del coach',
    cantidad: 'Cantidad',
    validez: 'Válidos hasta',
    finDeMes: 'fin de este mes',
    finMesSiguiente: 'fin del mes siguiente',
    elPlan: 'Plan',
    hasta: 'Hasta (incluido)',
    sinFecha: 'Sin fecha de fin',
    motivo: 'Motivo',
    // [P1-PLAN-LOTE-841] El motivo se guarda en el rastro del equipo hasta su purga (24 meses): nada de datos personales.
    motivoAyuda: 'Obligatorio. Queda anotado junto al cambio (p. ej., «compensación por el fallo del 27-sep»). No escribas datos personales ni de salud.',
    efecto: 'Efecto',
    nadaQueRecargar: 'Ya tiene disponible todo el cupo de su plan.',
    hastaEl: (f) => `hasta el ${f}`,
    sinFin: 'sin fecha de fin',
    cancelar: 'Cancelar',
    guardando: 'Guardando…',
    botonCreditos: (n, coach) => `Regalar ${n} ${coach ? 'mensajes' : 'créditos'}`,
    botonRecargar: (n) => `Recargar ${n}`,
    botonCortesia: (p) => `Dar ${p} de cortesía`,
    botonRevertir: 'Revertir el regalo',
};

// [I18N-EXEMPT: panel interno del dueño, solo español]
const NOMBRE_PLAN = { gratis: 'Gratis', basic: 'Básico', plus: 'Plus', ultra: 'Max', admin: 'Administración' };
const RANGO = { gratis: 0, basic: 1, plus: 2, ultra: 3 };
const PLANES = ['basic', 'plus', 'ultra'];
const CABECERA = { 'Content-Type': 'application/json', 'X-Admin-Accion': '1' };
const FORMATO = { day: 'numeric', month: 'short', year: 'numeric' };

const dia = (iso) => (iso ? formatDate(new Date(iso), FORMATO) : '—');
// El fin de un regalo es EXCLUSIVO (1-oct 00:00 ⇒ vale hasta el 30-sep): se enseña el último día que vale, en la hora
// de RD que fija `ultimoDiaDeRegalo` (la de la propia validez) y con el formato del panel — en el huso del dispositivo
// salía un día tarde visto desde Europa.
const ultimoDia = (iso) => (iso ? ultimoDiaDeRegalo(iso, (d, o) => formatDate(d, { ...FORMATO, timeZone: o.timeZone })) : '—');
const fechaLocal = (dias) => {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const planesMejores = (pagado) => PLANES.filter((p) => RANGO[p] > (RANGO[pagado] ?? 0));
// [P1-PLAN-LOTE-833 · ronda 1] ¿Trae la ficha los bloques del interruptor de cuentas de prueba (contrato 3)?
const traeBloquesNuevos = (f) => Boolean(f) && ['actividad', 'ajustes', 'prueba'].some((k) => Object.prototype.hasOwnProperty.call(f, k));

async function pedir(url, cuerpo) {
    const opciones = cuerpo === undefined ? {} : { method: 'POST', headers: CABECERA, body: JSON.stringify(cuerpo) };
    const r = await fetchWithAuth(url, opciones);
    let datos = null;
    try { datos = await r.json(); } catch { /* respuesta sin cuerpo */ }
    if (!r.ok) throw new Error(datos && typeof datos.detail === 'string' ? datos.detail : `Error ${r.status}`);
    return datos;
}

function Medidor({ titulo, m, esAdmin }) {
    return (
        <div className={styles.dato}>
            <span className={styles.datoEtiqueta}>{titulo}</span>
            {esAdmin ? <span className={styles.datoValor}>{TEXTOS.sinTope}</span> : (
                <>
                    <span className={styles.datoValor}>{m.usados}<span className={styles.de}> / {m.tope}</span></span>
                    {m.regalo > 0 && <span className={styles.datoNota}>{TEXTOS.deRegalo(m.regalo)}</span>}
                </>
            )}
        </div>
    );
}

export function Ficha({ ficha, onAccion, onCambio, onVerDetalle, refVerDetalle }) {
    const hayMejor = !ficha.es_admin && planesMejores(ficha.plan_pagado).length > 0;
    return (
        <article className={styles.ficha} aria-label={TEXTOS.cuenta(ficha.email)}>
            <header className={styles.fichaCabecera}>
                <h3 className={styles.correo}>{ficha.email}</h3>
                <p className={styles.sub}>{[ficha.nombre, TEXTOS.alta(dia(ficha.alta))].filter(Boolean).join(' · ')}</p>
            </header>
            {ficha.ios_gratis && (
                <section className={styles.iosGratis} aria-label="iPhone · Gratis">
                    <div className={styles.iosCabecera}>
                        <div>
                            <h4 className={styles.historialTitulo}>iPhone · Gratis</h4>
                            <p className={styles.sub}>Cupo mensual pensado para 14 días de uso frecuente. Independiente del plan de la web.</p>
                        </div>
                        <span className={styles.iosEtiqueta}>Sin pago</span>
                    </div>
                    <div className={styles.datos}>
                        <Medidor titulo="Créditos gratuitos" m={ficha.ios_gratis.creditos} />
                        <Medidor titulo="Mensajes gratuitos" m={ficha.ios_gratis.coach} />
                    </div>
                    <button type="button" className={styles.primario} onClick={() => onAccion({ tipo: 'ios_gratis' })}>Añadir recarga gratuita</button>
                    <p className={styles.datoNota}>Cada recarga añade {IOS_FREE_COACH.toLocaleString('es-DO')} mensajes y {IOS_FREE_GENERATION} créditos, válidos durante 14 días. Puedes repetirla cuando haga falta.</p>
                </section>
            )}
            <div className={styles.datos}>
                <div className={styles.dato}>
                    <span className={styles.datoEtiqueta}>{TEXTOS.plan}</span>
                    <span className={styles.datoValor}>{NOMBRE_PLAN[ficha.plan_efectivo] || ficha.plan_efectivo}</span>
                    {ficha.cortesia && (
                        <span className={styles.datoNota}>
                            {`${ficha.cortesia.hasta ? TEXTOS.cortesiaHasta(ultimoDia(ficha.cortesia.hasta)) : TEXTOS.cortesiaSinFin} · ${TEXTOS.paga(NOMBRE_PLAN[ficha.plan_pagado] || ficha.plan_pagado)}`}
                        </span>
                    )}
                </div>
                <div className={styles.dato}>
                    <span className={styles.datoEtiqueta}>{TEXTOS.suscripcion}</span>
                    <span className={styles.datoTexto}>
                        {ficha.suscripcion.paypal
                            ? TEXTOS.conPaypal(ficha.suscripcion.estado, ficha.suscripcion.fin && dia(ficha.suscripcion.fin))
                            : TEXTOS.sinPaypal}
                    </span>
                </div>
                <Medidor titulo={TEXTOS.creditos} m={ficha.creditos} esAdmin={ficha.es_admin} />
                <Medidor titulo={TEXTOS.coach} m={ficha.coach} esAdmin={ficha.es_admin} />
            </div>
            {ficha.es_admin ? <p className={styles.aviso}>{TEXTOS.esAdmin}</p> : (
                <div className={styles.acciones}>
                    <button type="button" className={styles.primario} onClick={() => onAccion({ tipo: 'creditos' })}>{TEXTOS.regalarCreditos}</button>
                    <button type="button" className={styles.boton} onClick={() => onAccion({ tipo: 'completo' })}>{TEXTOS.recargar}</button>
                    <button
                        type="button"
                        className={styles.boton}
                        onClick={() => onAccion({ tipo: 'cortesia' })}
                        disabled={!hayMejor}
                        title={hayMejor ? undefined : TEXTOS.ningunPlanMejor}
                    >
                        {TEXTOS.cortesia}
                    </button>
                </div>
            )}
            <section className={styles.historial} aria-label={TEXTOS.historial}>
                <h4 className={styles.historialTitulo}>{TEXTOS.historial}</h4>
                {ficha.regalos.length === 0 ? <p className={styles.sub}>{TEXTOS.sinHistorial}</p> : (
                    <ul className={styles.lista}>
                        {ficha.regalos.map((r) => (
                            <li key={r.id} className={styles.regalo} data-estado={r.estado}>
                                <div className={styles.regaloTexto}>
                                    <span className={styles.regaloDetalle}>{r.detalle}</span>
                                    <span className={styles.sub}>{TEXTOS.lineaRegalo(TEXTOS.estado[r.estado] || r.estado, r.hasta && ultimoDia(r.hasta), r.motivo)}</span>
                                </div>
                                {r.estado === 'vigente' && !ficha.es_admin && (
                                    <button type="button" className={styles.boton} onClick={() => onAccion({ tipo: 'revocar', regalo: r })}>{TEXTOS.revertir}</button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </section>
            {/* [P1-PLAN-LOTE-833] Actividad, cuenta de prueba y ajustes: solo si la ficha los trae (interruptor encendido) */}
            <AdminFichaAmpliada key={ficha.user_id} ficha={ficha} onCambio={onCambio} onVerDetalle={onVerDetalle} refVerDetalle={refVerDetalle} />
        </article>
    );
}

function Dialogo({ accion, ficha, onCerrar, onHecho }) {
    const idTitulo = useId();
    // [CORRECCIÓN CONTROLADOR · 2026-09-28] `idMotivo` separado de `idTitulo`: el campo Motivo
    // necesita su propio `htmlFor`/`id` explícito (ver más abajo, y su nota junto al <textarea>).
    const idMotivo = useId();
    const mejores = planesMejores(ficha.plan_pagado);
    const [medidor, setMedidor] = useState('generacion');
    const [cantidad, setCantidad] = useState('10');
    const [hasta, setHasta] = useState('mes');
    const [plan, setPlan] = useState(mejores[0] || 'ultra');
    const [fecha, setFecha] = useState('');
    const [sinFecha, setSinFecha] = useState(false);
    const [motivo, setMotivo] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState('');
    const [requestId] = useState(() => crypto.randomUUID());

    // [FIX ROUND 1 · 2026-09-28] SSOT a11y de modales custom (P2-CUSTOM-MODALS-A11Y): focus trap
    // (Tab/Shift+Tab ya NO se escapa a los botones de acción de la Ficha detrás del velo — antes
    // activaba uno y cambiaba `accion` sobre el mismo diálogo abierto), ESC, foco inicial al
    // contenedor y restaurar foco al disparador al cerrar. Sustituye el `useEffect` de ESC a mano y
    // el foco inicial a `primerCampo` que tenía este componente (el hook enfoca el contenedor).
    const { containerRef } = useModalAccessibility({ isOpen: true, onClose: onCerrar, disableClose: enviando });

    const m = medidor === 'coach' ? ficha.coach : ficha.creditos;
    const n = Math.max(0, Math.trunc(Number(cantidad) || 0));
    const aRecargar = Math.max(0, m.usados - m.regalo);
    const motivoValido = motivo.trim().length >= 3;

    let titulo;
    let efecto;
    let boton;
    let valido;
    let peticion;
    if (accion.tipo === 'ios_gratis') {
        titulo = 'Recarga gratuita para iPhone';
        efecto = `Añadir ${IOS_FREE_COACH.toLocaleString('es-DO')} mensajes y ${IOS_FREE_GENERATION} créditos por 14 días. No cambia la suscripción de la web.`;
        boton = 'Añadir recarga gratuita';
        valido = Boolean(ficha.ios_gratis);
        peticion = [`/api/admin/cuentas/${ficha.user_id}/ios-gratis/recargar`, { request_id: requestId, motivo }];
    } else if (accion.tipo === 'creditos') {
        titulo = TEXTOS.tituloCreditos;
        efecto = `${m.usados}/${m.tope} → ${m.usados}/${m.tope + n}`;
        boton = TEXTOS.botonCreditos(n, medidor === 'coach');
        valido = n >= 1 && n <= 1000;
        peticion = [`/api/admin/cuentas/${ficha.user_id}/creditos`, { medidor, modo: 'sumar', cantidad: n, hasta, motivo }];
    } else if (accion.tipo === 'completo') {
        titulo = TEXTOS.tituloRecargar;
        efecto = aRecargar > 0 ? `${m.usados}/${m.tope} → ${m.usados}/${m.tope + aRecargar}` : TEXTOS.nadaQueRecargar;
        boton = TEXTOS.botonRecargar(aRecargar);
        valido = aRecargar >= 1;
        peticion = [`/api/admin/cuentas/${ficha.user_id}/creditos`, { medidor, modo: 'completo', hasta, motivo }];
    } else if (accion.tipo === 'cortesia') {
        titulo = TEXTOS.tituloCortesia;
        const cuando = sinFecha ? TEXTOS.sinFin : (fecha ? TEXTOS.hastaEl(dia(`${fecha}T12:00:00`)) : '');
        efecto = `${NOMBRE_PLAN[ficha.plan_efectivo]} → ${NOMBRE_PLAN[plan]} ${cuando}`.trim();
        boton = TEXTOS.botonCortesia(NOMBRE_PLAN[plan]);
        valido = mejores.includes(plan) && (sinFecha || Boolean(fecha));
        peticion = [`/api/admin/cuentas/${ficha.user_id}/cortesia`, { plan, hasta: sinFecha ? null : fecha, motivo }];
    } else {
        titulo = TEXTOS.tituloRevertir;
        efecto = accion.regalo.detalle;
        boton = TEXTOS.botonRevertir;
        valido = true;
        peticion = [`/api/admin/regalos/${accion.regalo.id}/revocar`, { motivo }];
    }

    const enviar = async (e) => {
        e.preventDefault();
        if (!valido || !motivoValido || enviando) return;
        setEnviando(true);
        setError('');
        try {
            const datos = await pedir(peticion[0], peticion[1]);
            onHecho(datos?.cuenta || null);
        } catch (err) {
            setError(err.message);
            setEnviando(false);
        }
    };
    const esCreditos = accion.tipo === 'creditos' || accion.tipo === 'completo';

    return (
        <div className={styles.velo} role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !enviando) onCerrar(); }}>
            <form ref={containerRef} className={styles.dialogo} role="dialog" aria-modal="true" aria-labelledby={idTitulo} tabIndex={-1} onSubmit={enviar}>
                <h3 id={idTitulo} className={styles.dialogoTitulo}>{titulo}</h3>
                {esCreditos && (
                    <fieldset className={styles.campo}>
                        <legend className={styles.etiqueta}>{TEXTOS.medidor}</legend>
                        <div className={styles.opciones}>
                            {[['generacion', TEXTOS.planes], ['coach', TEXTOS.mensajes]].map(([id, texto]) => (
                                <label key={id} className={styles.opcion}>
                                    <input type="radio" name="medidor" value={id} checked={medidor === id} onChange={() => setMedidor(id)} />
                                    {texto}
                                </label>
                            ))}
                        </div>
                    </fieldset>
                )}
                {accion.tipo === 'creditos' && (
                    <label className={styles.campo}>
                        <span className={styles.etiqueta}>{TEXTOS.cantidad}</span>
                        <input className={styles.input} type="number" min="1" max="1000" step="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
                    </label>
                )}
                {esCreditos && (
                    <label className={styles.campo}>
                        <span className={styles.etiqueta}>{TEXTOS.validez}</span>
                        <select className={styles.input} value={hasta} onChange={(e) => setHasta(e.target.value)}>
                            <option value="mes">{TEXTOS.finDeMes}</option>
                            <option value="mes_siguiente">{TEXTOS.finMesSiguiente}</option>
                        </select>
                    </label>
                )}
                {accion.tipo === 'cortesia' && (
                    <>
                        <label className={styles.campo}>
                            <span className={styles.etiqueta}>{TEXTOS.elPlan}</span>
                            <select className={styles.input} value={plan} onChange={(e) => setPlan(e.target.value)}>
                                {mejores.map((p) => <option key={p} value={p}>{NOMBRE_PLAN[p]}</option>)}
                            </select>
                        </label>
                        <label className={styles.campo}>
                            <span className={styles.etiqueta}>{TEXTOS.hasta}</span>
                            <input className={styles.input} type="date" min={fechaLocal(0)} max={fechaLocal(365)} value={fecha} disabled={sinFecha} onChange={(e) => setFecha(e.target.value)} />
                        </label>
                        <label className={styles.opcion}>
                            <input type="checkbox" checked={sinFecha} onChange={(e) => setSinFecha(e.target.checked)} />
                            {TEXTOS.sinFecha}
                        </label>
                    </>
                )}
                {/* [CORRECCIÓN CONTROLADOR · 2026-09-28] `<div>` contenedor, NO `<label>` que envuelva: un
                    `<label>` que envuelve computa su nombre accesible con TODO su texto — incluida la ayuda—,
                    así que `getByLabelText('Motivo')` no casaría. `htmlFor`/`id` explícitos en su lugar; la
                    ayuda se referencia por `aria-describedby`, no por asociación de label. */}
                <div className={styles.campo}>
                    <label htmlFor={idMotivo} className={styles.etiqueta}>{TEXTOS.motivo}</label>
                    <textarea
                        id={idMotivo}
                        className={styles.input}
                        rows={2}
                        maxLength={300}
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                        aria-describedby={`${idMotivo}-ayuda`}
                    />
                    <span id={`${idMotivo}-ayuda`} className={styles.ayuda}>{TEXTOS.motivoAyuda}</span>
                </div>
                <p className={styles.efecto}>
                    <span className={styles.etiqueta}>{TEXTOS.efecto}</span>
                    <span>{efecto}</span>
                </p>
                {error && <p className={styles.error} role="alert">{error}</p>}
                <div className={styles.pie}>
                    <button type="button" className={styles.boton} onClick={onCerrar} disabled={enviando}>{TEXTOS.cancelar}</button>
                    <button type="submit" className={styles.primario} disabled={!valido || !motivoValido || enviando}>{enviando ? TEXTOS.guardando : boton}</button>
                </div>
            </form>
        </div>
    );
}

export default function AdminCuentas() {
    const [correo, setCorreo] = useAdminNavigationState('cuentas:correo', '');
    const [cuentaId, setCuentaId] = useAdminNavigationState('cuentas:id', '');
    const [enDetalle, setEnDetalle] = useAdminNavigationState('cuentas:detalle', false);
    const [restaurando, setRestaurando] = useState(Boolean(cuentaId));
    useAdminLoading(restaurando);
    const [estado, setEstado] = useState('inicio');      // inicio | buscando | nada | ficha | error
    const [ficha, setFicha] = useState(null);
    const [error, setError] = useState('');
    const [accion, setAccion] = useState(null);
    const [hecho, setHecho] = useState(false);
    // [P1-PLAN-LOTE-833 · 2026-09-29] `hayLista`: null mientras se pregunta, false si la lista respondió 404 (el panel
    // sigue como hoy). `versionLista` sube tras cada cambio para que la lista se refresque. `detalle`: la cuenta de
    // prueba cuyo detalle se ve (`{ user_id, email }`); `AdminPruebaDetalle` (lote 834) se monta con él al final.
    const [hayLista, setHayLista] = useState(null);
    const [versionLista, setVersionLista] = useState(0);
    const [detalle, setDetalle] = useState(null);
    // [ronda 1] Lo que pasa al abrir una cuenta desde la lista (`{ tipo: 'abriendo' | 'error', texto }`): lo pinta la
    // lista junto a su título, no debajo de la tabla.
    const [apertura, setApertura] = useState(null);
    const turno = useRef(0);          // la última búsqueda o apertura gana: nunca se pinta la ficha de otra cuenta
    const seccionRef = useRef(null);
    const volverRef = useRef(null);
    const detalleRef = useRef(null);
    const verDetalleRef = useRef(null);
    const enfocar = useRef(null);     // a dónde va el foco tras el próximo render (la vista cambia bajo el dedo)

    // [P1-PLAN-LOTE-833 · 2026-09-29] Layout: el foco se mueve en el MISMO commit que pinta la vista (con useEffect
    // un test bajo carga veía <body> un instante; el mismo arreglo que AdminPruebaDetalle).
    useLayoutEffect(() => {
        const destino = enfocar.current;
        if (!destino) return;
        enfocar.current = null;
        let el = null;
        if (destino === 'volver') el = volverRef.current;
        else if (destino === 'detalle') el = detalleRef.current;
        else if (destino === 'ficha') el = verDetalleRef.current;
        else if (seccionRef.current) {
            const id = destino.startsWith('cuenta:') ? destino.slice('cuenta:'.length) : null;
            el = [...seccionRef.current.querySelectorAll('[data-abrir-cuenta]')].find((b) => b.dataset.abrirCuenta === id)
                || seccionRef.current.querySelector('[data-titulo-lista]');
        }
        el?.focus();
    });

    useEffect(() => {
        if (!cuentaId) return undefined;
        let vivo = true;
        const mio = ++turno.current;
        (async () => {
            try {
                const datos = await pedir(`/api/admin/cuentas/${encodeURIComponent(cuentaId)}`);
                if (!vivo || mio !== turno.current) return;
                if (!datos?.cuenta) { setCuentaId(''); setEnDetalle(false); return; }
                setFicha(datos.cuenta);
                setEstado('ficha');
                if (enDetalle) setDetalle({ user_id: datos.cuenta.user_id, email: datos.cuenta.email });
            } catch (err) {
                if (!vivo || mio !== turno.current) return;
                setError(err.message);
                setCuentaId('');
                setEnDetalle(false);
            } finally { if (vivo) setRestaurando(false); }
        })();
        return () => { vivo = false; };
        // Restore only on mount; subsequent account openings already fetch fresh data.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const buscar = async (e) => {
        e.preventDefault();
        if (!correo.trim()) return;
        const mio = ++turno.current;
        setRestaurando(false);
        setCuentaId('');
        setEnDetalle(false);
        setEstado('buscando');
        setError('');
        setApertura(null);
        setHecho(false);
        try {
            const datos = await pedir('/api/admin/cuentas/buscar', { email: correo });
            if (mio !== turno.current) return;
            if (datos?.cuenta) { setCuentaId(datos.cuenta.user_id); setFicha(datos.cuenta); setEstado('ficha'); } else { setFicha(null); setEstado('nada'); }
        } catch (err) {
            if (mio !== turno.current) return;
            setError(err.message);
            setEstado('error');
        }
    };

    // [P1-PLAN-LOTE-833] Tocar un correo de la lista abre su ficha: la lista se aparta y el foco va a «Volver a la lista».
    const abrirDesdeLista = async (fila) => {
        const mio = ++turno.current;
        setRestaurando(false);
        setCuentaId('');
        setEnDetalle(false);
        setEstado('inicio');
        setError('');
        setHecho(false);
        setApertura({ tipo: 'abriendo', texto: TEXTOS.abriendo });
        try {
            const datos = await pedir(`/api/admin/cuentas/${fila.user_id}`);
            if (mio !== turno.current) return;
            if (!datos?.cuenta) { setApertura({ tipo: 'error', texto: TEXTOS.yaNoExiste }); return; }
            enfocar.current = 'volver';
            setApertura(null);
            setCuentaId(datos.cuenta.user_id);
            setFicha(datos.cuenta);
            setEstado('ficha');
        } catch (err) {
            if (mio !== turno.current) return;
            setApertura({ tipo: 'error', texto: err.message });
        }
    };
    const volverALista = () => {
        turno.current += 1;           // lo que aún esté en vuelo para la ficha que se deja ya no la pinta
        setCuentaId('');
        setEnDetalle(false);
        setApertura(null);
        enfocar.current = ficha ? `cuenta:${ficha.user_id}` : 'lista';
        setEstado('inicio');
        setFicha(null);
        setHecho(false);
        setError('');
    };
    const verDetalle = (d) => { setEnDetalle(true); enfocar.current = 'detalle'; setDetalle(d); };
    const cerrarDetalle = () => { setEnDetalle(false); enfocar.current = 'ficha'; setDetalle(null); };

    const alTerminar = async (cuenta) => {
        setAccion(null);
        setHecho(true);
        setVersionLista((v) => v + 1);   // [P1-PLAN-LOTE-833] la lista enseña plan y marca: que no se quede vieja
        // [ronda 1] Un regalo responde con la ficha del lote 774, SIN actividad, ajustes ni prueba: si la de la vista los
        // traía, se pide entera (mientras, la de la vista se queda; si falla, al menos los créditos nuevos).
        if (cuenta && !(traeBloquesNuevos(ficha) && !traeBloquesNuevos(cuenta))) { setFicha(cuenta); return; }
        const mio = turno.current;
        try {
            const datos = await pedir(`/api/admin/cuentas/${ficha.user_id}`);
            if (mio !== turno.current) return;
            if (datos?.cuenta) setFicha(datos.cuenta);
        } catch (err) {
            if (mio !== turno.current) return;
            if (cuenta) setFicha(cuenta);
            setError(err.message);
        }
    };

    const conFicha = estado === 'ficha' && Boolean(ficha);
    const vista = (
        <section ref={seccionRef} className={styles.cuentas} hidden={Boolean(detalle)}>
            {hayLista !== false && (
                <AdminCuentasLista
                    version={versionLista}
                    oculta={conFicha}
                    onDisponible={setHayLista}
                    onAbrir={abrirDesdeLista}
                    aviso={apertura}
                />
            )}
            {conFicha && hayLista && (
                <button ref={volverRef} type="button" className={`${styles.boton} ${styles.volver}`} onClick={volverALista}>
                    <ArrowLeft size={16} strokeWidth={2.25} aria-hidden="true" />
                    {TEXTOS.volverLista}
                </button>
            )}
            <form className={styles.buscador} role="search" onSubmit={buscar}>
                <label htmlFor="admin-correo-cuenta" className={styles.etiqueta}>{TEXTOS.correo}</label>
                <div className={styles.fila}>
                    <input
                        id="admin-correo-cuenta"
                        className={styles.input}
                        type="email"
                        autoComplete="off"
                        spellCheck={false}
                        value={correo}
                        onChange={(e) => setCorreo(e.target.value)}
                    />
                    <button type="submit" className={styles.primario} disabled={estado === 'buscando'}>
                        {estado === 'buscando' ? TEXTOS.buscando : TEXTOS.buscar}
                    </button>
                </div>
                {/* [ronda 1] La de «sin lista» solo cuando se SABE que no hay (404): mientras se pregunta, la otra. */}
                <p className={styles.ayuda}>{hayLista === false ? TEXTOS.ayudaBusqueda : TEXTOS.ayudaConLista}</p>
            </form>
            {estado === 'nada' && <p className={styles.vacio}>{TEXTOS.noExiste}</p>}
            {error && <p className={styles.error} role="alert">{error}</p>}
            {hecho && estado === 'ficha' && <p className={styles.hecho} role="status">{TEXTOS.hecho}</p>}
            {estado === 'ficha' && ficha && (
                <Ficha
                    ficha={ficha}
                    onAccion={(a) => { setHecho(false); setAccion(a); }}
                    onCambio={alTerminar}
                    onVerDetalle={verDetalle}
                    refVerDetalle={verDetalleRef}
                />
            )}
            {accion && ficha && <Dialogo accion={accion} ficha={ficha} onCerrar={() => setAccion(null)} onHecho={alTerminar} />}
        </section>
    );
    if (!detalle) return vista;
    // El detalle de prueba es ESTADO de la página: la lista, el buscador y la ficha siguen montados (ocultos) y volver
    // no pierde filtros, página ni selección.
    return (
        <>
            {vista}
            <section
                ref={detalleRef}
                className={styles.detalle}
                aria-label={TEXTOS.detalleDe(detalle.email)}
                data-detalle-prueba={detalle.user_id}
                tabIndex={-1}
            >
                <button type="button" className={`${styles.boton} ${styles.volver}`} onClick={cerrarDetalle}>
                    <ArrowLeft size={16} strokeWidth={2.25} aria-hidden="true" />
                    {TEXTOS.volverFicha}
                </button>
                {/* [P1-PLAN-LOTE-834 · 2026-09-29] El detalle de la cuenta de prueba: pestañas Formulario · Comidas ·
                    Planes · Conversaciones · Actividad, cada una pedida al abrirla. Se desmonta al volver a la ficha:
                    aborta lo que esté en vuelo y libera las fotos. */}
                <AdminPruebaDetalle userId={detalle.user_id} email={detalle.email} />
            </section>
        </>
    );
}
