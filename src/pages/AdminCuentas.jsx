// frontend/src/pages/AdminCuentas.jsx
// [P1-PLAN-LOTE-775 / 833] Panel admin · Cuentas: lista, buscador exacto, ficha con barras de consumo,
// regalos, cortesías, recarga gratuita iPhone, ficha ampliada y detalle de cuenta de prueba.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, MessageSquare } from 'lucide-react';
import { formatDate, formatNumber } from '../i18n';
import { useModalAccessibility } from '../hooks/useModalAccessibility';
import { ultimoDiaDeRegalo } from '../utils/regalosCuenta';
import {
    NOMBRE_PLAN, copiarTexto, fecha as dia, generarRequestId, marcaViva, pedirAdmin,
} from '../utils/adminCuentas';
import AdminCuentasLista from './AdminCuentasLista';
import AdminDialogoMotivo from './AdminDialogoMotivo';
import AdminFichaAmpliada from './AdminFichaAmpliada';
import AdminPruebaDetalle from './AdminPruebaDetalle';
import styles from './AdminCuentas.module.css';
import { useAdminLoading, useAdminNavigationState, useClearAdminNavigationPrefix } from '../hooks/useAdminNavigation';
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
    copiarCorreo: 'Copiar correo',
    copiado: 'Copiado',
    alta: (f) => `Registro: ${f}`,
    seccionPlan: 'Plan y cupos mensuales',
    etiquetaWebAndroid: 'Web y Android',
    badgeSinPaypal: 'Sin suscripción',
    badgePaypal: 'PayPal',
    verificadorAndroidSi: 'Verificador Android',
    verificadorAndroidNo: 'No verificador Android',
    abrirConversaciones: 'Abrir conversaciones y detalle',
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
    ayudaAcciones: '«Regalar créditos» suma cupo extra; «Recargar al completo» repone lo que ya gastó este mes.',
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
    tituloIosGratis: 'Cupo exclusivo de iPhone (App Store)',
    subIosGratis: 'Solo aplica dentro de la app de iOS (sin compras integradas). No afecta ni se mezcla con Web o Android.',
    etiquetaIosGratis: 'Independiente · Sin pago',
    creditosIosGratis: 'Créditos gratuitos',
    mensajesIosGratis: 'Mensajes gratuitos',
    botonIosGratis: 'Añadir recarga gratuita',
    notaIosGratis: (coach, gen) => `Cada recarga añade ${coach} mensajes y ${gen} créditos, válidos durante 14 días. Puedes repetirla cuando haga falta.`,
    dialogoIosTitulo: 'Recarga gratuita para iPhone',
    dialogoIosEfecto: (coach, gen) => `Añadir ${coach} mensajes y ${gen} créditos por 14 días. No cambia la suscripción de la web.`,
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
    quitarPrueba: 'Quitar marca de prueba',
    dialogoQuitarPrueba: {
        titulo: 'Quitar la marca de prueba',
        explicacion: 'El equipo deja de ver su actividad completa. Los números y los ajustes siguen a la vista.',
        boton: 'Quitar la marca',
    },
    erroresPrueba: {
        sin_marca: 'Esta cuenta ya no tenía la marca.',
        no_existe: 'Esta cuenta ya no existe.',
        motivo: 'El motivo debe tener entre 3 y 300 caracteres.',
        generico: 'No se pudo guardar; no se hizo ningún cambio.',
    },
};

const RANGO = { gratis: 0, basic: 1, plus: 2, ultra: 3 };
const PLANES = ['basic', 'plus', 'ultra'];
const FORMATO = { day: 'numeric', month: 'short', year: 'numeric' };

const ultimoDia = (iso) => (iso ? ultimoDiaDeRegalo(iso, (d, o) => formatDate(d, { ...FORMATO, timeZone: o.timeZone })) : '—');
const fechaLocal = (dias) => {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const planesMejores = (pagado) => PLANES.filter((p) => RANGO[p] > (RANGO[pagado] ?? 0));
const traeBloquesNuevos = (f) => Boolean(f) && ['actividad', 'ajustes', 'prueba'].some((k) => Object.prototype.hasOwnProperty.call(f, k));
const inicialDe = (f) => (String(f?.nombre || f?.email || '?').trim().charAt(0) || '?').toUpperCase();
const subirAlInicio = () => {
    if (typeof window === 'undefined' || typeof window.scrollTo !== 'function') return;
    if (/jsdom/i.test(window.navigator?.userAgent || '')) return;
    window.scrollTo({ top: 0, behavior: 'auto' });
};

function mensajeErrorPrueba(err) {
    if (err?.detalle && TEXTOS.erroresPrueba[err.detalle]) return TEXTOS.erroresPrueba[err.detalle];
    if (err?.status === 422) return TEXTOS.erroresPrueba.motivo;
    return err?.message || TEXTOS.erroresPrueba.generico;
}

function Medidor({ titulo, m, esAdmin }) {
    const usados = Number(m?.usados) || 0;
    const tope = Number(m?.tope) || 0;
    const regalo = Number(m?.regalo) || 0;
    const pct = tope > 0 ? Math.min(100, Math.round((usados / tope) * 100)) : 0;
    const nivel = pct >= 100 ? 'lleno' : (pct >= 80 ? 'alto' : 'normal');
    return (
        <div className={styles.dato}>
            <span className={styles.datoEtiqueta}>{titulo}</span>
            {esAdmin ? <span className={styles.datoValor}>{TEXTOS.sinTope}</span> : (
                <>
                    <span className={styles.datoValor}>{usados}<span className={styles.de}> / {tope}</span></span>
                    {tope > 0 && (
                        <span className={styles.medidorCarril} aria-hidden="true">
                            <span className={styles.medidorBarra} data-nivel={nivel} style={{ width: `${pct}%` }} />
                        </span>
                    )}
                    {regalo > 0 && <span className={styles.datoNota}>{TEXTOS.deRegalo(regalo)}</span>}
                </>
            )}
        </div>
    );
}

export function Ficha({ ficha, onAccion, onCambio, onVerDetalle, refVerDetalle }) {
    const [copiado, setCopiado] = useState(false);
    const [quitandoPruebaDe, setQuitandoPruebaDe] = useState(null);
    const quitandoPrueba = quitandoPruebaDe === ficha.user_id;
    const hayMejor = !ficha.es_admin && planesMejores(ficha.plan_pagado).length > 0;
    const suscripcion = ficha.suscripcion || {};
    const regalos = Array.isArray(ficha.regalos) ? ficha.regalos : [];

    const cerrarQuitarPrueba = useCallback(() => setQuitandoPruebaDe(null), []);
    const quitarPrueba = async (motivo) => {
        let datos;
        try {
            datos = await pedirAdmin(`/api/admin/cuentas/${encodeURIComponent(ficha.user_id)}/prueba/quitar`, { motivo });
        } catch (err) {
            throw new Error(mensajeErrorPrueba(err));
        }
        setQuitandoPruebaDe(null);
        onCambio?.(datos?.cuenta || null);
    };

    const copiarCorreo = async () => {
        if (!ficha.email) return;
        const ok = await copiarTexto(ficha.email);
        if (ok) {
            setCopiado(true);
            setTimeout(() => setCopiado(false), 1800);
        }
    };

    return (
        <article className={styles.ficha} aria-label={TEXTOS.cuenta(ficha.email)}>
            <header className={styles.fichaCabecera}>
                <div className={styles.fichaPersona}>
                    <span className={styles.fichaAvatar} data-admin={ficha.es_admin ? 'true' : undefined} aria-hidden="true">
                        {inicialDe(ficha)}
                    </span>
                    <div className={styles.fichaIdentidad}>
                        <div className={styles.fichaCorreoFila}>
                            <h3 className={styles.correo}>{ficha.email}</h3>
                            <button
                                type="button"
                                className={styles.copiarIcono}
                                aria-label={copiado ? TEXTOS.copiado : TEXTOS.copiarCorreo}
                                title={copiado ? TEXTOS.copiado : TEXTOS.copiarCorreo}
                                data-copiado={copiado ? 'true' : undefined}
                                onClick={copiarCorreo}
                            >
                                {copiado ? <Check size={14} strokeWidth={2.5} aria-hidden="true" /> : <Copy size={14} strokeWidth={2} aria-hidden="true" />}
                            </button>
                        </div>
                        <p className={styles.sub}>{[ficha.nombre, TEXTOS.alta(dia(ficha.alta))].filter(Boolean).join(' · ')}</p>
                    </div>
                </div>
                <div className={styles.fichaDerecha}>
                    <div className={styles.fichaBadges}>
                        {typeof ficha.verificador_android === 'boolean' && (
                            <span className={styles.fichaPill} data-tono={ficha.verificador_android ? 'android' : undefined}>
                                {ficha.verificador_android ? TEXTOS.verificadorAndroidSi : TEXTOS.verificadorAndroidNo}
                            </span>
                        )}
                        <span className={styles.fichaPill} data-tono="plan">
                            {NOMBRE_PLAN[ficha.plan_efectivo] || ficha.plan_efectivo}
                        </span>
                        <span className={styles.fichaPill}>
                            {suscripcion.paypal ? TEXTOS.badgePaypal : TEXTOS.badgeSinPaypal}
                        </span>
                    </div>
                    {marcaViva(ficha.prueba) && (
                        <button
                            ref={refVerDetalle}
                            type="button"
                            className={`${styles.primario} ${styles.ctaDetalle}`}
                            onClick={() => onVerDetalle?.({ user_id: ficha.user_id, email: ficha.email })}
                        >
                            <MessageSquare size={15} strokeWidth={2.2} aria-hidden="true" />
                            {TEXTOS.abrirConversaciones}
                            <ArrowRight size={15} strokeWidth={2.2} aria-hidden="true" />
                        </button>
                    )}
                </div>
            </header>

            <section className={styles.seccionCard} aria-label={TEXTOS.seccionPlan}>
                <div className={styles.seccionCabecera}>
                    <h4 className={styles.historialTitulo}>{TEXTOS.seccionPlan}</h4>
                    <span className={styles.seccionPill}>{TEXTOS.etiquetaWebAndroid}</span>
                </div>
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
                            {suscripcion.paypal
                                ? TEXTOS.conPaypal(suscripcion.estado, suscripcion.fin && dia(suscripcion.fin))
                                : TEXTOS.sinPaypal}
                        </span>
                    </div>
                    <Medidor titulo={TEXTOS.creditos} m={ficha.creditos} esAdmin={ficha.es_admin} />
                    <Medidor titulo={TEXTOS.coach} m={ficha.coach} esAdmin={ficha.es_admin} />
                </div>
                {ficha.es_admin ? <p className={styles.aviso}>{TEXTOS.esAdmin}</p> : (
                    <div className={styles.accionesGrupo}>
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
                        <p className={styles.ayudaAcciones}>{TEXTOS.ayudaAcciones}</p>
                    </div>
                )}
            </section>

            {ficha.ios_gratis && (
                <section className={styles.iosGratis} aria-label={TEXTOS.tituloIosGratis}>
                    <div className={styles.iosCabecera}>
                        <div>
                            <h4 className={styles.historialTitulo}>{TEXTOS.tituloIosGratis}</h4>
                            <p className={styles.sub}>{TEXTOS.subIosGratis}</p>
                        </div>
                        <span className={styles.iosEtiqueta}>{TEXTOS.etiquetaIosGratis}</span>
                    </div>
                    <div className={styles.datos}>
                        <Medidor titulo={TEXTOS.creditosIosGratis} m={ficha.ios_gratis.creditos} />
                        <Medidor titulo={TEXTOS.mensajesIosGratis} m={ficha.ios_gratis.coach} />
                    </div>
                    <div className={styles.iosPie}>
                        <button type="button" className={styles.boton} onClick={() => onAccion({ tipo: 'ios_gratis' })}>{TEXTOS.botonIosGratis}</button>
                        <p className={styles.ayudaAcciones}>{TEXTOS.notaIosGratis(formatNumber(IOS_FREE_COACH), IOS_FREE_GENERATION)}</p>
                    </div>
                </section>
            )}

            <section className={styles.historial} aria-label={TEXTOS.historial}>
                <div className={styles.historialCabecera}>
                    <h4 className={styles.historialTitulo}>{TEXTOS.historial}</h4>
                    {regalos.length > 0 && <span className={styles.seccionPill}>{regalos.length}</span>}
                </div>
                {regalos.length === 0 ? <p className={styles.sub}>{TEXTOS.sinHistorial}</p> : (
                    <ul className={styles.lista}>
                        {regalos.map((r) => (
                            <li key={r.id} className={styles.regalo} data-estado={r.estado}>
                                <div className={styles.regaloTexto}>
                                    <span className={styles.regaloDetalle}>{r.detalle}</span>
                                    <span className={styles.sub}>{TEXTOS.lineaRegalo(TEXTOS.estado[r.estado] || r.estado, r.hasta && ultimoDia(r.hasta), r.motivo)}</span>
                                </div>
                                {r.estado === 'vigente' && (!ficha.es_admin || r.usage_scope === 'ios_free') && (
                                    <button type="button" className={styles.boton} onClick={() => onAccion({ tipo: 'revocar', regalo: r })}>{TEXTOS.revertir}</button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </section>
            <AdminFichaAmpliada key={ficha.user_id} ficha={ficha} />
            {marcaViva(ficha.prueba) && (
                <footer className={styles.fichaPie}>
                    <button
                        type="button"
                        className={styles.accionSutil}
                        onClick={() => setQuitandoPruebaDe(ficha.user_id)}
                    >
                        {TEXTOS.quitarPrueba}
                    </button>
                </footer>
            )}
            {quitandoPrueba && (
                <AdminDialogoMotivo
                    {...TEXTOS.dialogoQuitarPrueba}
                    onEnviar={quitarPrueba}
                    onCerrar={cerrarQuitarPrueba}
                />
            )}
        </article>
    );
}

function Dialogo({ accion, ficha, onCerrar, onHecho }) {
    const idTitulo = useId();
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
    const [requestId] = useState(() => generarRequestId());
    const enviandoRef = useRef(false);

    // `onClose` estable para no desmontar/remontar la trampa de foco ni devolver foco al fondo al empezar a enviar.
    const cerrar = useCallback(() => { if (!enviandoRef.current) onCerrar(); }, [onCerrar]);
    const { containerRef } = useModalAccessibility({ isOpen: true, onClose: cerrar });

    const m = (medidor === 'coach' ? ficha.coach : ficha.creditos) || { usados: 0, tope: 0, regalo: 0 };
    const n = Math.max(0, Math.trunc(Number(cantidad) || 0));
    const aRecargar = Math.max(0, (Number(m.usados) || 0) - (Number(m.regalo) || 0));
    const motivoLimpio = motivo.trim();
    const motivoValido = motivoLimpio.length >= 3;
    const uidUrl = encodeURIComponent(ficha.user_id);

    let titulo;
    let efecto;
    let boton;
    let valido;
    let peticion;
    if (accion.tipo === 'ios_gratis') {
        titulo = TEXTOS.dialogoIosTitulo;
        efecto = TEXTOS.dialogoIosEfecto(formatNumber(IOS_FREE_COACH), IOS_FREE_GENERATION);
        boton = TEXTOS.botonIosGratis;
        valido = Boolean(ficha.ios_gratis);
        peticion = [`/api/admin/cuentas/${uidUrl}/ios-gratis/recargar`, { request_id: requestId, motivo: motivoLimpio }];
    } else if (accion.tipo === 'creditos') {
        titulo = TEXTOS.tituloCreditos;
        efecto = `${m.usados}/${m.tope} → ${m.usados}/${m.tope + n}`;
        boton = TEXTOS.botonCreditos(n, medidor === 'coach');
        valido = n >= 1 && n <= 1000;
        peticion = [`/api/admin/cuentas/${uidUrl}/creditos`, { medidor, modo: 'sumar', cantidad: n, hasta, motivo: motivoLimpio }];
    } else if (accion.tipo === 'completo') {
        titulo = TEXTOS.tituloRecargar;
        efecto = aRecargar > 0 ? `${m.usados}/${m.tope} → ${m.usados}/${m.tope + aRecargar}` : TEXTOS.nadaQueRecargar;
        boton = TEXTOS.botonRecargar(aRecargar);
        valido = aRecargar >= 1;
        peticion = [`/api/admin/cuentas/${uidUrl}/creditos`, { medidor, modo: 'completo', hasta, motivo: motivoLimpio }];
    } else if (accion.tipo === 'cortesia') {
        titulo = TEXTOS.tituloCortesia;
        const cuando = sinFecha ? TEXTOS.sinFin : (fecha ? TEXTOS.hastaEl(dia(`${fecha}T12:00:00`)) : '');
        const planActual = NOMBRE_PLAN[ficha.plan_efectivo] || ficha.plan_efectivo;
        const planNuevo = NOMBRE_PLAN[plan] || plan;
        efecto = `${planActual} → ${planNuevo} ${cuando}`.trim();
        boton = TEXTOS.botonCortesia(planNuevo);
        valido = mejores.includes(plan) && (sinFecha || Boolean(fecha));
        peticion = [`/api/admin/cuentas/${uidUrl}/cortesia`, { plan, hasta: sinFecha ? null : fecha, motivo: motivoLimpio }];
    } else {
        titulo = TEXTOS.tituloRevertir;
        efecto = accion.regalo.detalle;
        boton = TEXTOS.botonRevertir;
        valido = true;
        peticion = [`/api/admin/regalos/${encodeURIComponent(accion.regalo.id)}/revocar`, { motivo: motivoLimpio }];
    }

    const enviar = async (e) => {
        e.preventDefault();
        if (!valido || !motivoValido || enviandoRef.current) return;
        enviandoRef.current = true;
        setEnviando(true);
        setError('');
        try {
            const datos = await pedirAdmin(peticion[0], peticion[1]);
            onHecho(datos?.cuenta || null);
        } catch (err) {
            enviandoRef.current = false;
            setError(err.message);
            setEnviando(false);
        }
    };
    const esCreditos = accion.tipo === 'creditos' || accion.tipo === 'completo';

    return (
        <div className={styles.velo} role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) cerrar(); }}>
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
                    <button type="button" className={styles.boton} onClick={cerrar} disabled={enviando}>{TEXTOS.cancelar}</button>
                    <button type="submit" className={styles.primario} disabled={!valido || !motivoValido} aria-disabled={enviando || undefined}>
                        {enviando ? TEXTOS.guardando : boton}
                    </button>
                </div>
            </form>
        </div>
    );
}

export default function AdminCuentas() {
    const [correo, setCorreo] = useAdminNavigationState('cuentas:correo', '');
    const [cuentaId, setCuentaId] = useAdminNavigationState('cuentas:id', '');
    const [enDetalle, setEnDetalle] = useAdminNavigationState('cuentas:detalle', false);
    const limpiarNav = useClearAdminNavigationPrefix();
    const [restaurando, setRestaurando] = useState(Boolean(cuentaId));
    useAdminLoading(restaurando);
    const [estado, setEstado] = useState('inicio');
    const [ficha, setFicha] = useState(null);
    const [error, setError] = useState('');
    const [accion, setAccion] = useState(null);
    const [hecho, setHecho] = useState(false);
    const [hayLista, setHayLista] = useState(null);
    const [versionLista, setVersionLista] = useState(0);
    const [detalle, setDetalle] = useState(null);
    const [apertura, setApertura] = useState(null);
    const turno = useRef(0);
    const seccionRef = useRef(null);
    const volverRef = useRef(null);
    const detalleRef = useRef(null);
    const verDetalleRef = useRef(null);
    const enfocar = useRef(null);

    const cerrarDialogo = useCallback(() => setAccion(null), []);

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
    }, [estado, ficha, detalle]);

    useEffect(() => {
        if (!cuentaId) return undefined;
        let vivo = true;
        const controller = new AbortController();
        const mio = ++turno.current;
        (async () => {
            try {
                const datos = await pedirAdmin(`/api/admin/cuentas/${encodeURIComponent(cuentaId)}`, undefined, { signal: controller.signal });
                if (!vivo || mio !== turno.current) return;
                if (!datos?.cuenta) { setCuentaId(''); setEnDetalle(false); return; }
                setFicha(datos.cuenta);
                setEstado('ficha');
                if (enDetalle && marcaViva(datos.cuenta.prueba)) {
                    setDetalle({ user_id: datos.cuenta.user_id, email: datos.cuenta.email });
                } else if (enDetalle) {
                    setEnDetalle(false);
                }
            } catch (err) {
                if (!vivo || controller.signal.aborted || mio !== turno.current) return;
                setError(err.message);
                setCuentaId('');
                setEnDetalle(false);
            } finally { if (vivo) setRestaurando(false); }
        })();
        return () => { vivo = false; controller.abort(); };
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
            const datos = await pedirAdmin('/api/admin/cuentas/buscar', { email: correo });
            if (mio !== turno.current) return;
            if (datos?.cuenta) { setCuentaId(datos.cuenta.user_id); setFicha(datos.cuenta); setEstado('ficha'); } else { setFicha(null); setEstado('nada'); }
        } catch (err) {
            if (mio !== turno.current) return;
            setError(err.message);
            setEstado('error');
        }
    };

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
            const datos = await pedirAdmin(`/api/admin/cuentas/${encodeURIComponent(fila.user_id)}`);
            if (mio !== turno.current) return;
            if (!datos?.cuenta) { setApertura({ tipo: 'error', texto: TEXTOS.yaNoExiste }); return; }
            enfocar.current = 'volver';
            setApertura(null);
            setCuentaId(datos.cuenta.user_id);
            setFicha(datos.cuenta);
            setEstado('ficha');
            subirAlInicio();
        } catch (err) {
            if (mio !== turno.current) return;
            setApertura({ tipo: 'error', texto: err.message });
        }
    };

    const volverALista = () => {
        turno.current += 1;
        setCuentaId('');
        setEnDetalle(false);
        setApertura(null);
        enfocar.current = ficha ? `cuenta:${ficha.user_id}` : 'lista';
        setEstado('inicio');
        setFicha(null);
        setHecho(false);
        setError('');
    };

    const verDetalle = (d) => {
        setEnDetalle(true);
        enfocar.current = 'detalle';
        setDetalle(d);
        subirAlInicio();
    };
    const cerrarDetalle = () => {
        if (detalle?.user_id) {
            limpiarNav(`prueba:${detalle.user_id}:`);
            limpiarNav(`/api/admin/cuentas/${encodeURIComponent(detalle.user_id)}/prueba:`);
        }
        setEnDetalle(false);
        enfocar.current = 'ficha';
        setDetalle(null);
    };

    const alTerminar = async (cuenta) => {
        setAccion(null);
        setError('');
        setVersionLista((v) => v + 1);
        if (cuenta && !(traeBloquesNuevos(ficha) && !traeBloquesNuevos(cuenta))) {
            setFicha(cuenta);
            setHecho(true);
            return;
        }
        const mio = turno.current;
        try {
            const datos = await pedirAdmin(`/api/admin/cuentas/${encodeURIComponent(ficha.user_id)}`);
            if (mio !== turno.current) return;
            if (datos?.cuenta) setFicha(datos.cuenta);
            setHecho(true);
        } catch (err) {
            if (mio !== turno.current) return;
            if (cuenta) setFicha(cuenta);
            setHecho(false);
            setError(err.message);
        }
    };

    const conFicha = estado === 'ficha' && Boolean(ficha);
    const claveDialogo = accion ? `${accion.tipo}-${accion.regalo?.id || ficha?.user_id || ''}` : '';
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
            <form className={styles.buscador} role="search" onSubmit={buscar} hidden={Boolean(conFicha && hayLista)}>
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
            {accion && ficha && (
                <Dialogo key={claveDialogo} accion={accion} ficha={ficha} onCerrar={cerrarDialogo} onHecho={alTerminar} />
            )}
        </section>
    );
    if (!detalle) return vista;
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
                <AdminPruebaDetalle userId={detalle.user_id} email={detalle.email} />
            </section>
        </>
    );
}
