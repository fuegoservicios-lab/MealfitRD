import { useCallback, useEffect, useId, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { LogOut, RefreshCw, Search, ShieldCheck, X } from 'lucide-react';
import { authClient, sendEmailOtp } from '../authClient';
import Wordmark from '../components/common/Wordmark';
import { api } from '../config/api';
import { cifra, fecha } from '../utils/adminCuentas';
import { verifyEmailOtpFirstParty } from '../utils/firstPartySession';
import styles from './VerificadoresPage.module.css';

// [I18N-EXEMPT: portal interno para verificadores Android, solo español]
const TEXTOS = {
    insignia: 'Acceso interno',
    ariaLogin: 'Acceso interno al panel',
    tituloLogin: 'Acceso restringido',
    comprobando: 'Comprobando sesión…',
    descColab: 'Ingresa con tu cuenta de colaborador para ver el progreso de verificadores en Google Play.',
    descAdmin: 'Inicia sesión con tu cuenta de administrador para entrar al panel completo.',
    tabColab: 'Colaborador',
    tabAdmin: 'Administrador',
    ariaModoAcceso: 'Tipo de acceso',
    sinConfigurar: 'El acceso de colaboradores aún no está configurado en este servidor.',
    usuario: 'Usuario',
    clave: 'Contraseña',
    entrar: 'Entrar',
    entrando: 'Entrando…',
    googleAdmin: 'Continuar con Google',
    googleCargando: 'Conectando con Google…',
    separadorO: 'o',
    correoAdmin: 'Correo de administrador',
    enviarCodigo: 'Enviar código',
    enviandoCodigo: 'Enviando código…',
    codigoAdmin: 'Código de verificación',
    placeholderCodigo: '000000',
    entrarPanel: 'Entrar al panel',
    verificandoCodigo: 'Verificando…',
    otroCorreo: 'Usar otro correo',
    errorCredenciales: 'Usuario o contraseña incorrectos.',
    errorCorreoVacio: 'Ingresa tu correo de administrador.',
    errorCodigoCorto: 'Ingresa el código recibido por correo.',
    errorOtp: 'No se pudo enviar o verificar el código.',
    errorGoogle: 'No se pudo iniciar sesión con Google.',
    errorRed: 'No se pudo conectar con el servidor.',
    errorLista: 'No se pudo cargar el seguimiento de verificadores.',
    subtituloBarra: 'Seguimiento · Verificadores Android',
    actualizar: 'Actualizar',
    actualizando: 'Actualizando…',
    salir: 'Salir',
    ariaResumen: 'Progreso para Google Play',
    kpiMeta: 'Meta Google Play',
    metaAlcanzada: 'Mínimo de 12 alcanzado',
    faltan: (n) => `Faltan ${n} verificadores`,
    kpiActivos: 'Activos (7 días)',
    deTotal: (n) => `de ${n} verificadores`,
    kpiUso: 'Con uso registrado',
    notaUso: 'Comida, coach o escaneo',
    kpiDias: (d) => `Cumplen ${d}+ días`,
    notaDias: 'Objetivo: 14 días continuos',
    ariaHerramientas: 'Buscar y filtrar verificadores',
    placeholderBuscar: 'Buscar correo o nombre…',
    ariaBuscar: 'Buscar correo o nombre',
    limpiar: 'Limpiar búsqueda',
    ariaFiltros: 'Filtrar por uso',
    vacio: 'Ningún verificador coincide con el filtro actual.',
    cumple14: 'Cumple 14d',
    activo7: 'Activo 7d',
    sinUso7: 'Sin uso 7d',
    sinActividad: 'Sin actividad',
    comidas30: (n) => `${n} en 30d`,
    diasActivos: (num, fmt) => (num === 1 ? `${fmt} día` : `${fmt} días`),
    metaPlayOk: 'Meta 14d ✓',
    metaPlayProgreso: (fmt, meta) => `${fmt} de ${meta} meta`,
    tooltipRegistro: 'Fecha en que creó su cuenta',
};

// [I18N-EXEMPT: portal interno para verificadores Android, solo español]
const FILTROS = [
    ['todos', 'Todos'],
    ['activos', 'Activos (7d)'],
    ['sin_uso', 'Sin uso reciente'],
];

// [I18N-EXEMPT: portal interno para verificadores Android, solo español]
const COLUMNAS = {
    verificador: 'Verificador',
    ultima: 'Última actividad',
    diasTabla: 'Días activos',
    diasMovil: 'Días activos (30d)',
    comidas: 'Comidas',
    coach: 'Coach',
    escaneos: 'Escaneos',
    alta: 'Registro',
};

const inicialDe = (correo, nombre) => ((nombre || correo || '?').trim()[0] || '?').toUpperCase();

function etiquetaEstado(v) {
    if (v.cumple_14d) return { texto: TEXTOS.cumple14, tono: 'cumple' };
    if (v.activo_7d) return { texto: TEXTOS.activo7, tono: 'activo' };
    return { texto: TEXTOS.sinUso7, tono: 'pendiente' };
}

function GoogleIcono() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M21.8 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.5c-.2 1.2-.9 2.3-2 3v2.5h3.2c1.9-1.7 3.1-4.3 3.1-7.4z" />
            <path d="M12 22c2.7 0 5-.9 6.7-2.4l-3.2-2.5c-.9.6-2.1 1-3.5 1-2.7 0-4.9-1.8-5.7-4.2H3v2.6C4.7 19.8 8.1 22 12 22z" />
            <path d="M6.3 13.9c-.2-.6-.3-1.2-.3-1.9s.1-1.3.3-1.9V7.5H3C2.4 8.9 2 10.4 2 12s.4 3.1 1 4.5l3.3-2.6z" />
            <path d="M12 5.9c1.5 0 2.8.5 3.9 1.5l2.9-2.9C17 2.9 14.7 2 12 2 8.1 2 4.7 4.2 3 7.5l3.3 2.6C7.1 7.7 9.3 5.9 12 5.9z" />
        </svg>
    );
}

export default function VerificadoresPage() {
    const location = useLocation();
    const idUsuario = useId();
    const idClave = useId();
    const idCorreoAdmin = useId();
    const idCodigoAdmin = useId();
    const idBuscar = useId();

    const [modoAcceso, setModoAcceso] = useState(() => (
        new URLSearchParams(location.search).get('acceso') === 'admin' ? 'admin' : 'colaborador'
    ));
    const [fase, setFase] = useState('cargando'); // 'cargando' | 'login' | 'sin_configurar' | 'panel'
    const [usuarioSesion, setUsuarioSesion] = useState('');
    const [usuarioForm, setUsuarioForm] = useState('');
    const [claveForm, setClaveForm] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [errorLogin, setErrorLogin] = useState('');

    // Acceso de administrador (Google OAuth o OTP por correo hacia /admin)
    const [correoAdmin, setCorreoAdmin] = useState('');
    const [pasoAdmin, setPasoAdmin] = useState('email'); // 'email' | 'code'
    const [codigoAdmin, setCodigoAdmin] = useState('');
    const [enviandoAdmin, setEnviandoAdmin] = useState(false);
    const [googleCargando, setGoogleCargando] = useState(false);
    const [errorAdmin, setErrorAdmin] = useState('');

    const [buscar, setBuscar] = useState('');
    const [estadoFiltro, setEstadoFiltro] = useState('todos');
    const [datos, setDatos] = useState(null);
    const [actualizando, setActualizando] = useState(false);
    const [errorLista, setErrorLista] = useState('');

    const cargarLista = useCallback(async (q = '', est = 'todos') => {
        setActualizando(true);
        setErrorLista('');
        try {
            const qs = new URLSearchParams({ buscar: q, estado: est });
            const r = await fetch(api(`/api/verificadores/cuentas?${qs}`), { credentials: 'include' });
            if (r.status === 401) {
                setFase('login');
                setDatos(null);
                return;
            }
            if (r.status === 503) {
                setFase('sin_configurar');
                return;
            }
            if (!r.ok) throw new Error(`Error ${r.status}`);
            const body = await r.json();
            setDatos(body);
            setFase('panel');
        } catch {
            setErrorLista(TEXTOS.errorLista);
        } finally {
            setActualizando(false);
        }
    }, []);

    useEffect(() => {
        let vivo = true;
        (async () => {
            try {
                const r = await fetch(api('/api/verificadores/yo'), { credentials: 'include' });
                if (!vivo) return;
                if (!r.ok) {
                    setFase('login');
                    return;
                }
                const info = await r.json();
                if (!vivo) return;
                if (!info.configurado) {
                    setFase('sin_configurar');
                    return;
                }
                if (info.autenticado) {
                    setUsuarioSesion(info.usuario || '');
                    await cargarLista('', 'todos');
                } else {
                    setFase('login');
                }
            } catch {
                if (vivo) setFase('login');
            }
        })();
        return () => { vivo = false; };
    }, [cargarLista]);

    useEffect(() => {
        if (fase !== 'panel') return undefined;
        const timer = setTimeout(() => {
            cargarLista(buscar.trim(), estadoFiltro);
        }, 200);
        return () => clearTimeout(timer);
    }, [buscar, estadoFiltro, fase, cargarLista]);

    const iniciarSesion = async (e) => {
        e.preventDefault();
        if (enviando) return;
        setErrorLogin('');
        setEnviando(true);
        try {
            const r = await fetch(api('/api/verificadores/login'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ usuario: usuarioForm, clave: claveForm }),
            });
            const body = await r.json().catch(() => ({}));
            if (r.status === 503) {
                setFase('sin_configurar');
                return;
            }
            if (!r.ok) {
                setErrorLogin(body?.detail || TEXTOS.errorCredenciales);
                return;
            }
            setUsuarioSesion(body?.usuario || usuarioForm.trim());
            setClaveForm('');
            await cargarLista('', estadoFiltro);
        } catch {
            setErrorLogin(TEXTOS.errorRed);
        } finally {
            setEnviando(false);
        }
    };

    const entrarGoogleAdmin = async () => {
        if (googleCargando) return;
        setGoogleCargando(true);
        setErrorAdmin('');
        try { sessionStorage.setItem('mf_oauth_pending', '1'); } catch { /* noop */ }
        try {
            const { error } = await authClient.auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo: `${window.location.origin}/admin` },
            });
            if (error) throw error;
        } catch (err) {
            try { sessionStorage.removeItem('mf_oauth_pending'); } catch { /* noop */ }
            setErrorAdmin(err?.message || TEXTOS.errorGoogle);
            setGoogleCargando(false);
        }
    };

    const enviarCodigoAdmin = async (e) => {
        e.preventDefault();
        if (enviandoAdmin) return;
        const limpio = correoAdmin.trim();
        if (!limpio) {
            setErrorAdmin(TEXTOS.errorCorreoVacio);
            return;
        }
        setErrorAdmin('');
        setEnviandoAdmin(true);
        try {
            const { error } = await sendEmailOtp(limpio);
            if (error) {
                setErrorAdmin(error.message || TEXTOS.errorOtp);
                return;
            }
            setPasoAdmin('code');
        } catch {
            setErrorAdmin(TEXTOS.errorOtp);
        } finally {
            setEnviandoAdmin(false);
        }
    };

    const verificarCodigoAdmin = async (e) => {
        e.preventDefault();
        if (enviandoAdmin) return;
        const limpio = codigoAdmin.trim();
        if (limpio.length < 4) {
            setErrorAdmin(TEXTOS.errorCodigoCorto);
            return;
        }
        setErrorAdmin('');
        setEnviandoAdmin(true);
        try {
            const { error } = await verifyEmailOtpFirstParty(correoAdmin.trim(), limpio);
            if (error) {
                setErrorAdmin(error.message || TEXTOS.errorOtp);
                return;
            }
            window.location.assign('/admin');
        } catch {
            setErrorAdmin(TEXTOS.errorOtp);
        } finally {
            setEnviandoAdmin(false);
        }
    };

    const cerrarSesion = async () => {
        try {
            await fetch(api('/api/verificadores/logout'), { method: 'POST', credentials: 'include' });
        } finally {
            setDatos(null);
            setUsuarioSesion('');
            setBuscar('');
            setEstadoFiltro('todos');
            setFase('login');
        }
    };

    if (fase !== 'panel') {
        const enAdmin = modoAcceso === 'admin';
        return (
            <main className={`${styles.pantalla} ${styles.centro}`}>
                <section className={styles.loginTarjeta} aria-label={TEXTOS.ariaLogin}>
                    <div className={styles.marca}>
                        <Wordmark size={26} />
                        <span className={styles.insignia}>
                            <ShieldCheck size={13} strokeWidth={2.2} aria-hidden="true" />
                            {TEXTOS.insignia}
                        </span>
                    </div>
                    <div>
                        <h1 className={styles.loginTitulo}>{TEXTOS.tituloLogin}</h1>
                        <p className={styles.loginDesc}>
                            {enAdmin
                                ? TEXTOS.descAdmin
                                : (fase === 'cargando' ? TEXTOS.comprobando : TEXTOS.descColab)}
                        </p>
                    </div>
                    <div className={styles.tabs} role="tablist" aria-label={TEXTOS.ariaModoAcceso}>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={!enAdmin}
                            className={styles.tabBtn}
                            data-activo={!enAdmin ? 'true' : undefined}
                            onClick={() => setModoAcceso('colaborador')}
                        >
                            {TEXTOS.tabColab}
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={enAdmin}
                            className={styles.tabBtn}
                            data-activo={enAdmin ? 'true' : undefined}
                            onClick={() => setModoAcceso('admin')}
                        >
                            {TEXTOS.tabAdmin}
                        </button>
                    </div>

                    {!enAdmin && fase === 'sin_configurar' && (
                        <p className={styles.aviso} role="status">{TEXTOS.sinConfigurar}</p>
                    )}

                    {!enAdmin && fase === 'login' && (
                        <form className={styles.formulario} onSubmit={iniciarSesion}>
                            <div className={styles.campo}>
                                <label htmlFor={idUsuario} className={styles.etiqueta}>{TEXTOS.usuario}</label>
                                <input
                                    id={idUsuario}
                                    className={styles.input}
                                    type="text"
                                    autoComplete="username"
                                    required
                                    value={usuarioForm}
                                    onChange={(e) => setUsuarioForm(e.target.value)}
                                />
                            </div>
                            <div className={styles.campo}>
                                <label htmlFor={idClave} className={styles.etiqueta}>{TEXTOS.clave}</label>
                                <input
                                    id={idClave}
                                    className={styles.input}
                                    type="password"
                                    autoComplete="current-password"
                                    required
                                    value={claveForm}
                                    onChange={(e) => setClaveForm(e.target.value)}
                                />
                            </div>
                            {errorLogin && <p className={styles.error} role="alert">{errorLogin}</p>}
                            <button type="submit" className={styles.primario} disabled={enviando}>
                                {enviando ? TEXTOS.entrando : TEXTOS.entrar}
                            </button>
                        </form>
                    )}

                    {enAdmin && (
                        <div className={styles.formulario}>
                            <button
                                type="button"
                                className={styles.secundario}
                                onClick={entrarGoogleAdmin}
                                disabled={googleCargando || enviandoAdmin}
                            >
                                <GoogleIcono />
                                {googleCargando ? TEXTOS.googleCargando : TEXTOS.googleAdmin}
                            </button>
                            <div className={styles.separador}><span>{TEXTOS.separadorO}</span></div>
                            {pasoAdmin === 'email' ? (
                                <form className={styles.formulario} onSubmit={enviarCodigoAdmin}>
                                    <div className={styles.campo}>
                                        <label htmlFor={idCorreoAdmin} className={styles.etiqueta}>{TEXTOS.correoAdmin}</label>
                                        <input
                                            id={idCorreoAdmin}
                                            className={styles.input}
                                            type="email"
                                            autoComplete="email"
                                            required
                                            value={correoAdmin}
                                            onChange={(e) => setCorreoAdmin(e.target.value)}
                                        />
                                    </div>
                                    {errorAdmin && <p className={styles.error} role="alert">{errorAdmin}</p>}
                                    <button type="submit" className={styles.primario} disabled={enviandoAdmin}>
                                        {enviandoAdmin ? TEXTOS.enviandoCodigo : TEXTOS.enviarCodigo}
                                    </button>
                                </form>
                            ) : (
                                <form className={styles.formulario} onSubmit={verificarCodigoAdmin}>
                                    <div className={styles.campo}>
                                        <label htmlFor={idCodigoAdmin} className={styles.etiqueta}>{TEXTOS.codigoAdmin}</label>
                                        <input
                                            id={idCodigoAdmin}
                                            className={styles.input}
                                            type="text"
                                            inputMode="numeric"
                                            autoComplete="one-time-code"
                                            placeholder={TEXTOS.placeholderCodigo}
                                            maxLength={6}
                                            required
                                            value={codigoAdmin}
                                            onChange={(e) => setCodigoAdmin(e.target.value.replace(/\D/g, ''))}
                                        />
                                    </div>
                                    {errorAdmin && <p className={styles.error} role="alert">{errorAdmin}</p>}
                                    <button type="submit" className={styles.primario} disabled={enviandoAdmin}>
                                        {enviandoAdmin ? TEXTOS.verificandoCodigo : TEXTOS.entrarPanel}
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.botonTexto}
                                        onClick={() => { setPasoAdmin('email'); setCodigoAdmin(''); setErrorAdmin(''); }}
                                    >
                                        {TEXTOS.otroCorreo}
                                    </button>
                                </form>
                            )}
                        </div>
                    )}
                </section>
            </main>
        );
    }

    const resumen = datos?.resumen || {
        total: 0, meta_google_play: 12, faltan: 12, activos_7d: 0, con_actividad: 0, cumplen_14d: 0, dias_meta: 14,
    };
    const verificadores = Array.isArray(datos?.verificadores) ? datos.verificadores : [];

    return (
        <main className={styles.pantalla}>
            <div className={styles.contenedor}>
                <header className={styles.barraSuperior}>
                    <div className={styles.identidad}>
                        <Wordmark size={26} />
                        <span className={styles.subtituloApp}>{TEXTOS.subtituloBarra}</span>
                    </div>
                    <div className={styles.acciones}>
                        {usuarioSesion && <span className={styles.usuarioPill}>{usuarioSesion}</span>}
                        <button
                            type="button"
                            className={styles.boton}
                            onClick={() => cargarLista(buscar.trim(), estadoFiltro)}
                            disabled={actualizando}
                        >
                            <RefreshCw size={14} strokeWidth={2.2} aria-hidden="true" />
                            {actualizando ? TEXTOS.actualizando : TEXTOS.actualizar}
                        </button>
                        <button type="button" className={styles.boton} onClick={cerrarSesion}>
                            <LogOut size={14} strokeWidth={2.2} aria-hidden="true" />
                            {TEXTOS.salir}
                        </button>
                    </div>
                </header>

                <section className={styles.resumen} aria-label={TEXTOS.ariaResumen}>
                    <article className={styles.kpi}>
                        <span className={styles.kpiEtiqueta}>{TEXTOS.kpiMeta}</span>
                        <span className={styles.kpiValor}>{resumen.total} / {resumen.meta_google_play}</span>
                        <progress className={styles.progreso} value={Math.min(resumen.total, resumen.meta_google_play)} max={resumen.meta_google_play} />
                        <span className={styles.kpiNota}>
                            {resumen.faltan === 0 ? TEXTOS.metaAlcanzada : TEXTOS.faltan(resumen.faltan)}
                        </span>
                    </article>
                    <article className={styles.kpi}>
                        <span className={styles.kpiEtiqueta}>{TEXTOS.kpiActivos}</span>
                        <span className={styles.kpiValor}>{resumen.activos_7d}</span>
                        <span className={styles.kpiNota}>{TEXTOS.deTotal(resumen.total)}</span>
                    </article>
                    <article className={styles.kpi}>
                        <span className={styles.kpiEtiqueta}>{TEXTOS.kpiUso}</span>
                        <span className={styles.kpiValor}>{resumen.con_actividad}</span>
                        <span className={styles.kpiNota}>{TEXTOS.notaUso}</span>
                    </article>
                    <article className={styles.kpi}>
                        <span className={styles.kpiEtiqueta}>{TEXTOS.kpiDias(resumen.dias_meta)}</span>
                        <span className={styles.kpiValor}>{resumen.cumplen_14d}</span>
                        <span className={styles.kpiNota}>{TEXTOS.notaDias}</span>
                    </article>
                </section>

                <section className={styles.herramientas} aria-label={TEXTOS.ariaHerramientas}>
                    <div className={styles.buscarCaja}>
                        <Search size={15} strokeWidth={2} className={styles.buscarIcono} aria-hidden="true" />
                        <input
                            id={idBuscar}
                            type="search"
                            className={`${styles.input} ${styles.inputBuscar}`}
                            placeholder={TEXTOS.placeholderBuscar}
                            aria-label={TEXTOS.ariaBuscar}
                            value={buscar}
                            onChange={(e) => setBuscar(e.target.value)}
                        />
                        {buscar && (
                            <button
                                type="button"
                                className={styles.limpiarBtn}
                                aria-label={TEXTOS.limpiar}
                                onClick={() => setBuscar('')}
                            >
                                <X size={14} strokeWidth={2.2} aria-hidden="true" />
                            </button>
                        )}
                    </div>
                    <div className={styles.filtros} role="group" aria-label={TEXTOS.ariaFiltros}>
                        {FILTROS.map(([clave, nombre]) => (
                            <button
                                key={clave}
                                type="button"
                                className={styles.filtroBtn}
                                data-activo={estadoFiltro === clave ? 'true' : undefined}
                                aria-pressed={estadoFiltro === clave}
                                onClick={() => setEstadoFiltro(clave)}
                            >
                                {nombre}
                            </button>
                        ))}
                    </div>
                </section>

                {errorLista && <p className={styles.error} role="alert">{errorLista}</p>}

                {verificadores.length === 0 ? (
                    <p className={styles.vacio}>{TEXTOS.vacio}</p>
                ) : (
                    <div className={styles.desplazable} aria-busy={actualizando || undefined}>
                        <table className={styles.tabla}>
                            <thead>
                                <tr>
                                    <th scope="col">{COLUMNAS.verificador}</th>
                                    <th scope="col">{COLUMNAS.ultima}</th>
                                    <th scope="col" className={styles.num} title={COLUMNAS.diasMovil}>{COLUMNAS.diasTabla}</th>
                                    <th scope="col" className={styles.num}>{COLUMNAS.comidas}</th>
                                    <th scope="col" className={styles.num}>{COLUMNAS.coach}</th>
                                    <th scope="col" className={styles.num}>{COLUMNAS.escaneos}</th>
                                    <th scope="col" className={styles.num} title={TEXTOS.tooltipRegistro}>{COLUMNAS.alta}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {verificadores.map((v) => {
                                    const a = v.actividad || {};
                                    const badge = etiquetaEstado(v);
                                    return (
                                        <tr key={v.email}>
                                            <td className={styles.celdaPersona}>
                                                <div className={styles.persona}>
                                                    <span className={styles.avatar} aria-hidden="true">{inicialDe(v.email, v.nombre)}</span>
                                                    <div className={styles.personaInfo}>
                                                        <span className={styles.correo}>{v.email}</span>
                                                        {v.nombre && <span className={styles.nombre}>{v.nombre}</span>}
                                                        <span className={styles.etiquetas}>
                                                            <span className={styles.chip} data-estado={badge.tono}>{badge.texto}</span>
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td data-etiqueta={COLUMNAS.ultima} className={styles.fecha}>
                                                {a.ultima ? fecha(a.ultima) : TEXTOS.sinActividad}
                                            </td>
                                            <td data-etiqueta={COLUMNAS.diasMovil} className={styles.num}>
                                                {(() => {
                                                    const diasNum = Number(a.dias_activos_30d) || 0;
                                                    const diasFmt = cifra(a.dias_activos_30d);
                                                    const metaCumplida = diasNum >= resumen.dias_meta;
                                                    return (
                                                        <div>
                                                            <span className={!diasNum ? styles.cero : undefined}>{TEXTOS.diasActivos(diasNum, diasFmt)}</span>
                                                            <span className={metaCumplida ? styles.notaOk : styles.nota}>
                                                                {metaCumplida ? TEXTOS.metaPlayOk : TEXTOS.metaPlayProgreso(diasFmt, resumen.dias_meta)}
                                                            </span>
                                                        </div>
                                                    );
                                                })()}
                                            </td>
                                            <td data-etiqueta={COLUMNAS.comidas} className={styles.num}>
                                                <div>
                                                    <span className={!a.comidas_total ? styles.cero : undefined}>{cifra(a.comidas_total)}</span>
                                                    <span className={styles.nota}>{TEXTOS.comidas30(cifra(a.comidas_30d))}</span>
                                                </div>
                                            </td>
                                            <td data-etiqueta={COLUMNAS.coach} className={`${styles.num} ${!a.mensajes_coach ? styles.cero : ''}`}>
                                                {cifra(a.mensajes_coach)}
                                            </td>
                                            <td data-etiqueta={COLUMNAS.escaneos} className={`${styles.num} ${!a.escaneos ? styles.cero : ''}`}>
                                                {cifra(a.escaneos)}
                                            </td>
                                            <td data-etiqueta={COLUMNAS.alta} className={`${styles.num} ${styles.fecha}`}>
                                                {fecha(v.alta)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </main>
    );
}
