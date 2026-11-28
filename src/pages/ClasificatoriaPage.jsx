import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
    Award,
    Calendar,
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    ChevronUp,
    Crown,
    Droplets,
    EyeOff,
    Flame,
    Globe,
    Loader2,
    Lock,
    MapPin,
    Medal,
    Share2,
    Shield,
    Star,
    Swords,
    Target,
    Trophy,
    Utensils,
    X,
    Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAssessment } from '../context/AssessmentContext';
import { formatNumber, useT, useTn } from '../i18n';
import { useBottomSheet } from '../hooks/useBottomSheet';
import { useModalAccessibility } from '../hooks/useModalAccessibility';
import Button from '../components/ui/Button';
import { fetchWithAuth } from '../config/api';
import {
    compararConRival,
    guardarPerfilJuego,
    invalidarCacheClasificatoria,
    leerClasificatoriaGuardada,
    pedirClasificatoria,
} from '../utils/progresoServidor';
import { nombreDelRango } from '../utils/juegoPuntos';
import { compartirClasificatoria } from '../utils/compartirClasificatoria';
import styles from './ClasificatoriaPage.module.css';

const FILAS_VISIBLES = 7;

const CLAVE_RANGO_CSS = {
    bronce: styles.rango_bronce,
    plata: styles.rango_plata,
    oro: styles.rango_oro,
    platino: styles.rango_platino,
    diamante: styles.rango_diamante,
    maestro: styles.rango_maestro,
};

const MISION_META = (t) => ({
    proteina_4d: {
        titulo: t('Proteína firme'),
        desc: t('Cumple tu meta de proteína 4 días esta semana'),
    },
    micros_3d: {
        titulo: t('Radar de nutrientes'),
        desc: t('Completa micronutrientes clave 3 días'),
    },
    equilibrio_4d: {
        titulo: t('Equilibrio limpio'),
        desc: t('Completa 4 días sin pasarte de carbos ni grasas'),
    },
    racha_5d: {
        titulo: t('Constancia semanal'),
        desc: t('Registra al menos 5 días seguidos esta semana'),
    },
    banda_3d: {
        titulo: t('Precisión calórica'),
        desc: t('Cierra 3 días dentro de tu banda calórica'),
    },
    perfecto_1d: {
        titulo: t('Jornada diez de diez'),
        desc: t('Logra al menos 1 día perfecto esta semana'),
    },
    agua_5d: {
        titulo: t('Hidratación al día'),
        desc: t('Alcanza tu meta de vasos de agua 5 días'),
    },
});

const INSIGNIA_META = (t) => ({
    primera_chispa: { nombre: t('Primera chispa'), desc: t('Racha de 3 días seguidos'), icon: Flame },
    llama_viva: { nombre: t('Llama viva'), desc: t('Racha de 7 días seguidos'), icon: Flame },
    imparable: { nombre: t('Imparable'), desc: t('Racha de 14 días seguidos'), icon: Zap },
    leyenda: { nombre: t('Leyenda'), desc: t('Racha de 30 días seguidos'), icon: Crown },
    centurion: { nombre: t('Centurión'), desc: t('Racha de 100 días seguidos'), icon: Award },
    primer_dia_perfecto: { nombre: t('Primer día perfecto'), desc: t('Cierra tu primer día perfecto'), icon: Star },
    cinco_dias_perfectos: { nombre: t('Cinco días perfectos'), desc: t('Acumula 5 días perfectos'), icon: CheckCircle2 },
    semana_perfecta: { nombre: t('Semana perfecta'), desc: t('Alcanza 3 estrellas en una semana'), icon: Calendar },
    escudo_guardian: { nombre: t('Escudo guardián'), desc: t('Consigue o activa un escudo de racha'), icon: Shield },
    misiones_completas: { nombre: t('Trío completo'), desc: t('Completa las 3 misiones de una semana'), icon: Target },
    podio_semanal: { nombre: t('Podio semanal'), desc: t('Termina una semana en el Top 3'), icon: Medal },
    campeon_semanal: { nombre: t('Campeón semanal'), desc: t('Alcanza el puesto #1 en una semana'), icon: Trophy },
    maestro_bioboros: { nombre: t('Maestro'), desc: t('Alcanza el rango máximo de carrera'), icon: Crown },
});

function textoCierre(segundos, t) {
    const s = Math.max(0, Number(segundos) || 0);
    const dias = Math.floor(s / 86400);
    const horas = Math.floor((s % 86400) / 3600);
    if (dias >= 1) return t('Cierra en {d}d {h}h', { d: dias, h: horas });
    const mins = Math.max(1, Math.floor((s % 3600) / 60));
    if (horas >= 1) return t('Cierra en {h}h {m}m', { h: horas, m: mins });
    return t('Cierra en {m} min', { m: mins });
}

function textoSala(temporada, t) {
    if (!temporada || temporada.modo_sala === 'arena_abierta') return t('Arena abierta');
    const partes = String(temporada.nombre_sala || '').split('_');
    const franja = partes[1] || '';
    if (franja === 'bronce' || franja === 'plata') return t('Liga Bronce y Plata');
    if (franja === 'oro' || franja === 'platino') return t('Liga Oro y Platino');
    if (franja === 'diamante') return t('Liga Diamante y Maestro');
    return t('Liga semanal');
}

function valorDe(fila, tab) {
    if (tab === 'rachas') return Number(fila?.racha) || 0;
    if (tab === 'general') return Number(fila?.puntos_total) || 0;
    return Number(fila?.puntos_semana) || 0;
}

function textoValor(valor, tab, t, tn) {
    if (tab === 'rachas') return tn(valor, '{n} día', '{n} días', { n: formatNumber(valor) });
    return t('{n} pts', { n: formatNumber(valor) });
}

/** Cuánto llevas del camino hasta el de arriba (0-100): tu valor sobre el suyo. */
function avanceAlRival(valor, diferencia) {
    const v = Math.max(0, Number(valor) || 0);
    const d = Math.max(0, Number(diferencia) || 0);
    if (v + d <= 0) return 0;
    return Math.round((v / (v + d)) * 100);
}

function Avatar({ fila, grande = false, chico = false }) {
    const rango = CLAVE_RANGO_CSS[fila?.rank_key] || styles.rango_bronce;
    const tam = grande ? styles.avatarGrande : chico ? styles.avatarChico : '';
    return (
        <span className={`${styles.avatar} ${tam} ${rango}`} aria-hidden="true">
            {fila?.iniciales}
        </span>
    );
}

Avatar.propTypes = {
    fila: PropTypes.object,
    grande: PropTypes.bool,
    chico: PropTypes.bool,
};

function DueloModal({ duelo, cargando, onCerrar }) {
    const t = useT();
    const tn = useTn();
    const containerRef = useRef(null);
    const bodyRef = useRef(null);
    const { containerRef: modalRef } = useModalAccessibility({ isOpen: true, onClose: onCerrar });
    const hoja = useBottomSheet({ containerRef, bodyRef, onClose: onCerrar });
    const setPanelRef = useCallback((el) => {
        containerRef.current = el;
        modalRef.current = el;
    }, [modalRef]);

    const tu = duelo?.tu;
    const rival = duelo?.rival;
    const dias = (n) => tn(n, '{n} día', '{n} días', { n: formatNumber(n) });
    const filas = tu && rival ? [
        { k: 'sem', etiqueta: t('Puntos semana'), a: tu.puntos_semana, b: rival.puntos_semana, txtA: formatNumber(tu.puntos_semana), txtB: formatNumber(rival.puntos_semana) },
        { k: 'tot', etiqueta: t('Puntos totales'), a: tu.puntos_total, b: rival.puntos_total, txtA: formatNumber(tu.puntos_total), txtB: formatNumber(rival.puntos_total) },
        { k: 'racha', etiqueta: t('Racha actual'), a: tu.racha, b: rival.racha, txtA: dias(tu.racha), txtB: dias(rival.racha) },
        { k: 'mracha', etiqueta: t('Mejor racha'), a: tu.mejor_racha, b: rival.mejor_racha, txtA: dias(tu.mejor_racha), txtB: dias(rival.mejor_racha) },
        { k: 'perf', etiqueta: t('Semanas perfectas'), a: tu.semanas_perfectas, b: rival.semanas_perfectas, txtA: formatNumber(tu.semanas_perfectas), txtB: formatNumber(rival.semanas_perfectas) },
        { k: 'ins', etiqueta: t('Insignias'), a: tu.insignias_total, b: rival.insignias_total, txtA: formatNumber(tu.insignias_total), txtB: formatNumber(rival.insignias_total) },
    ] : [];

    return createPortal(
        <div className={styles.hojaFondo} onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
            <div
                ref={setPanelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="duelo-titulo"
                tabIndex={-1}
                className={styles.hojaPanel}
                onTouchStart={hoja.onTouchStart}
                onTouchMove={hoja.onTouchMove}
                onTouchEnd={hoja.onTouchEnd}
                onTouchCancel={hoja.onTouchEnd}
            >
                <div className={styles.hojaCabecera}>
                    <h2 id="duelo-titulo" className={styles.hojaTitulo}>{t('Cara a cara')}</h2>
                    <button type="button" className={styles.cerrarBtn} onClick={onCerrar} aria-label={t('Cerrar')}>
                        <X size={18} strokeWidth={2.5} aria-hidden="true" />
                    </button>
                </div>
                <div ref={bodyRef} className={styles.hojaCuerpo}>
                    {cargando && (
                        <div className={styles.estadoCaja}>
                            <Loader2 size={24} className="spin-animation" aria-hidden="true" />
                            <p className={styles.estadoDesc}>{t('Comparando jugadores…')}</p>
                        </div>
                    )}
                    {!cargando && tu && rival && (
                        <>
                            <div className={styles.dueloCabecera}>
                                <div className={styles.dueloJugador}>
                                    <Avatar fila={tu} grande />
                                    <span className={styles.dueloAlias}>{tu.alias}</span>
                                    <span className={styles.dueloRango}>{nombreDelRango(tu.rank_key, tu.rank_division, t)}</span>
                                </div>
                                <span className={styles.dueloVs}><Swords size={18} strokeWidth={2.5} aria-hidden="true" /></span>
                                <div className={styles.dueloJugador}>
                                    <Avatar fila={rival} grande />
                                    <span className={styles.dueloAlias}>{rival.alias}</span>
                                    <span className={styles.dueloRango}>{nombreDelRango(rival.rank_key, rival.rank_division, t)}</span>
                                </div>
                            </div>
                            <div className={styles.dueloFilas}>
                                {filas.map((f) => (
                                    <div key={f.k} className={styles.dueloFila}>
                                        <span className={`${styles.dueloValIzq} ${f.a > f.b ? styles.dueloGana : ''}`}>{f.txtA}</span>
                                        <span className={styles.dueloEtiqueta}>{f.etiqueta}</span>
                                        <span className={`${styles.dueloValDer} ${f.b > f.a ? styles.dueloGana : ''}`}>{f.txtB}</span>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
                <div className={styles.hojaPie}>
                    <Button variant="secondary" onClick={onCerrar}>{t('Cerrar')}</Button>
                </div>
            </div>
        </div>,
        document.body,
    );
}

DueloModal.propTypes = {
    duelo: PropTypes.object,
    cargando: PropTypes.bool,
    onCerrar: PropTypes.func.isRequired,
};

function PrivacidadModal({ perfil, userId, onGuardado, onCerrar }) {
    const t = useT();
    const containerRef = useRef(null);
    const bodyRef = useRef(null);
    const [aliasInput, setAliasInput] = useState(perfil?.display_alias || '');
    const [incognito, setIncognito] = useState(!perfil?.opt_in);
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState('');
    const { containerRef: modalRef } = useModalAccessibility({ isOpen: true, onClose: onCerrar, disableClose: guardando });
    const hoja = useBottomSheet({ containerRef, bodyRef, onClose: onCerrar, disabled: guardando });
    const setPanelRef = useCallback((el) => {
        containerRef.current = el;
        modalRef.current = el;
    }, [modalRef]);

    const guardar = async (e) => {
        e.preventDefault();
        const limpio = aliasInput.trim();
        if (limpio && (limpio.length < 3 || limpio.length > 20)) {
            setError(t('Tu alias debe tener entre 3 y 20 caracteres.'));
            return;
        }
        setError('');
        setGuardando(true);
        try {
            await guardarPerfilJuego(userId, {
                display_alias: limpio || null,
                opt_in: !incognito,
                limpiar_apodo: !limpio && Boolean(perfil?.display_alias),
            });
            // [P1-PLAN-LOTE-1183] sin aviso: el cambio ya se ve en pantalla (regla de P1-PLAN-LOTE-1181)
            onGuardado();
            onCerrar();
        } catch (err) {
            setError(err?.message || t('No pudimos guardar tu identidad.'));
        } finally {
            setGuardando(false);
        }
    };

    return createPortal(
        <div className={styles.hojaFondo} onClick={(e) => { if (!guardando && e.target === e.currentTarget) onCerrar(); }}>
            <div
                ref={setPanelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="privacidad-titulo"
                tabIndex={-1}
                className={styles.hojaPanel}
                onTouchStart={hoja.onTouchStart}
                onTouchMove={hoja.onTouchMove}
                onTouchEnd={hoja.onTouchEnd}
                onTouchCancel={hoja.onTouchEnd}
            >
                <div className={styles.hojaCabecera}>
                    <h2 id="privacidad-titulo" className={styles.hojaTitulo}>{t('Identidad y privacidad')}</h2>
                    <button type="button" className={styles.cerrarBtn} onClick={onCerrar} disabled={guardando} aria-label={t('Cerrar')}>
                        <X size={18} strokeWidth={2.5} aria-hidden="true" />
                    </button>
                </div>
                <form onSubmit={guardar} className={styles.hojaCuerpo} ref={bodyRef}>
                    <div className={styles.campoGrupo}>
                        <label htmlFor="alias-juego" className={styles.campoEtiqueta}>{t('Alias en la clasificatoria')}</label>
                        <input
                            id="alias-juego"
                            type="text"
                            maxLength={20}
                            value={aliasInput}
                            onChange={(e) => setAliasInput(e.target.value)}
                            placeholder={t('Ej: TitanFit (opcional)')}
                            className={styles.campoInput}
                        />
                        <span className={styles.campoAyuda}>
                            {t('Si lo dejas vacío se mostrará tu nombre abreviado. Nunca mostramos correo ni datos médicos.')}
                        </span>
                    </div>

                    <div className={styles.incognitoFila}>
                        <div className={styles.incognitoTexto}>
                            <strong>{t('Modo incógnito')}</strong>
                            <span>{t('Aparece como «Jugador» con un código anónimo en la tabla.')}</span>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={incognito}
                            aria-label={t('Modo incógnito')}
                            className={`${styles.interruptor} ${incognito ? styles.interruptorOn : ''}`}
                            onClick={() => setIncognito((v) => !v)}
                        >
                            <span className={styles.interruptorPulgar} aria-hidden="true" />
                        </button>
                    </div>

                    {error && <p className={styles.errorTxt} role="alert">{error}</p>}

                    <div className={styles.hojaPie}>
                        <Button variant="secondary" onClick={onCerrar} disabled={guardando}>{t('Cancelar')}</Button>
                        <Button type="submit" disabled={guardando}>
                            {guardando ? t('Guardando…') : t('Guardar cambios')}
                        </Button>
                    </div>
                </form>
            </div>
        </div>,
        document.body,
    );
}

PrivacidadModal.propTypes = {
    perfil: PropTypes.object,
    userId: PropTypes.string.isRequired,
    onGuardado: PropTypes.func.isRequired,
    onCerrar: PropTypes.func.isRequired,
};

function PuestoDelPodio({ fila, tab, bonos, minimo, onAbrir }) {
    const t = useT();
    const tn = useTn();
    const clasePuesto = fila.posicion === 1 ? styles.puestoOro : fila.posicion === 2 ? styles.puestoPlata : styles.puestoBronce;
    const bono = tab === 'semanal' && fila.puntos_semana >= minimo ? bonos[fila.posicion - 1] : 0;
    return (
        <button type="button" className={`${styles.puesto} ${clasePuesto}`} onClick={() => onAbrir(fila)}>
            <span className={styles.puestoCabeza}>
                {fila.posicion === 1 && <Crown size={20} strokeWidth={2.25} className={styles.corona} aria-hidden="true" />}
                <span className={styles.anillo}>
                    <Avatar fila={fila} grande={fila.posicion === 1} />
                </span>
                <span className={styles.medallaPuesto}>{fila.posicion}</span>
            </span>
            <span className={styles.puestoNombre}>{fila.alias}</span>
            <span className={styles.puestoRango}>
                {fila.es_yo && <span className={styles.etiquetaTu}>{t('Tú')}</span>}
                {nombreDelRango(fila.rank_key, fila.rank_division, t)}
            </span>
            <span className={styles.pedestal}>
                <span className={styles.pedestalValor}>{textoValor(valorDe(fila, tab), tab, t, tn)}</span>
                {bono > 0 && <span className={styles.bonoChip}>{t('+{n} pts podio', { n: bono })}</span>}
            </span>
        </button>
    );
}

PuestoDelPodio.propTypes = {
    fila: PropTypes.object.isRequired,
    tab: PropTypes.string.isRequired,
    bonos: PropTypes.array.isRequired,
    minimo: PropTypes.number.isRequired,
    onAbrir: PropTypes.func.isRequired,
};

export default function ClasificatoriaPage() {
    const t = useT();
    const tn = useTn();
    const navigate = useNavigate();
    const { session, userProfile, isGuest, updateUserProfile } = useAssessment();
    const userId = session?.user?.id || userProfile?.id || '';

    const [tab, setTab] = useState('semanal');
    const [scope, setScope] = useState('global');
    const datosIniciales = typeof leerClasificatoriaGuardada === 'function'
        ? leerClasificatoriaGuardada(userId, 'semanal', 'global')
        : null;
    const [datos, setDatos] = useState(datosIniciales);
    const [cargando, setCargando] = useState(!datosIniciales);
    const [compartiendo, setCompartiendo] = useState(false);
    const [privacidadAbierta, setPrivacidadAbierta] = useState(false);
    const [duelo, setDuelo] = useState(null);
    const [cargandoDuelo, setCargandoDuelo] = useState(false);
    const [version, setVersion] = useState(0);
    const [verTodos, setVerTodos] = useState(false);
    const [nombreRapido, setNombreRapido] = useState('');
    const [guardandoNombre, setGuardandoNombre] = useState(false);
    const forzarRef = useRef(false);

    const cargar = useCallback(async () => {
        if (!userId || isGuest) {
            setCargando(false);
            return;
        }
        const cached = typeof leerClasificatoriaGuardada === 'function'
            ? leerClasificatoriaGuardada(userId, tab, scope)
            : null;
        if (cached) {
            setDatos(cached);
            setCargando(false);
        }
        const forzar = forzarRef.current;
        forzarRef.current = false;
        try {
            const opts = forzar ? { tab, scope, force: true } : { tab, scope };
            const resp = await pedirClasificatoria(userId, opts);
            if (resp) setDatos(resp);
        } catch {
            /* mantiene el estado previo si hubo fallo puntual */
        } finally {
            setCargando(false);
        }
    }, [userId, isGuest, tab, scope]);

    useEffect(() => {
        cargar();
    }, [cargar, version]);

    useEffect(() => {
        const refrescar = () => {
            if (typeof invalidarCacheClasificatoria === 'function') invalidarCacheClasificatoria(userId);
            forzarRef.current = true;
            setVersion((v) => v + 1);
        };
        const alVolver = () => { if (!document.hidden) refrescar(); };
        window.addEventListener('mealfit:diary-changed', refrescar);
        window.addEventListener('mealfit:water-changed', refrescar);
        window.addEventListener('mealfit:profile-updated', refrescar);
        document.addEventListener('visibilitychange', alVolver);
        return () => {
            window.removeEventListener('mealfit:diary-changed', refrescar);
            window.removeEventListener('mealfit:water-changed', refrescar);
            window.removeEventListener('mealfit:profile-updated', refrescar);
            document.removeEventListener('visibilitychange', alVolver);
        };
    }, [userId]);

    const abrirRival = async (fila) => {
        if (!fila?.user_id || !userId) return;
        if (fila.es_yo) {
            setPrivacidadAbierta(true);
            return;
        }
        setCargandoDuelo(true);
        setDuelo({ tu: null, rival: null });
        try {
            const resp = await compararConRival(userId, fila.user_id);
            setDuelo(resp || null);
        } catch {
            setDuelo(null);
            toast.error(t('No pudimos cargar la comparación.'));
        } finally {
            setCargandoDuelo(false);
        }
    };

    const alCompartir = async () => {
        if (!datos || compartiendo) return;
        setCompartiendo(true);
        try {
            const estado = await compartirClasificatoria(datos, datos.mi_perfil);
            if (estado === 'descargado') toast.success(t('Imagen lista y texto copiado para compartir.'));
            else if (estado === 'fallo') toast.error(t('No se pudo compartir desde este dispositivo.'));
        } catch {
            toast.error(t('No se pudo compartir desde este dispositivo.'));
        } finally {
            setCompartiendo(false);
        }
    };

    const podio = useMemo(() => {
        const raw = datos?.podio || [];
        if (raw.length === 3) return [raw[1], raw[0], raw[2]];
        return raw;
    }, [datos]);

    const tablaResto = useMemo(() => (datos?.tabla || []).slice(3), [datos]);
    const filasMostradas = verTodos ? tablaResto : tablaResto.slice(0, FILAS_VISIBLES);

    const misionesMeta = MISION_META(t);
    const insigniasMeta = INSIGNIA_META(t);
    const bonosPodio = datos?.temporada?.bonos_podio || [45, 30, 15];
    const minPodioPts = datos?.temporada?.minimo_podio_pts ?? 60;
    const paisUsuario = datos?.mi_perfil?.country_code || '';
    const yo = datos?.mi_perfil || null;
    const rival = yo?.rival_arriba || null;
    const sinNombreVisible = Boolean(
        yo
        && yo.opt_in !== false
        && !(userProfile?.full_name || '').trim()
        && !(yo.display_alias || '').trim()
        && /^Jugador\s*#/i.test(String(yo.alias || ''))
    );

    const guardarNombreRapido = async (e) => {
        e.preventDefault();
        const limpio = nombreRapido.trim();
        if (limpio.length < 2 || limpio.length > 40) {
            toast.error(t('Escribe un nombre entre 2 y 40 caracteres.'));
            return;
        }
        setGuardandoNombre(true);
        try {
            if (typeof updateUserProfile === 'function') {
                const res = await updateUserProfile({ full_name: limpio });
                if (!res?.success) throw res?.error || new Error('save_failed');
            } else {
                const resp = await fetchWithAuth('/api/profile', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fields: { full_name: limpio } }),
                });
                if (!resp.ok) throw new Error('save_failed');
            }
            setNombreRapido('');
            if (typeof invalidarCacheClasificatoria === 'function') invalidarCacheClasificatoria(userId);
            forzarRef.current = true;
            window.dispatchEvent(new CustomEvent('mealfit:profile-updated'));
            setVersion((v) => v + 1);
            // [P1-PLAN-LOTE-1183] sin aviso: el cambio ya se ve en pantalla (regla de P1-PLAN-LOTE-1181)
        } catch {
            toast.error(t('No pudimos guardar tu nombre.'));
        } finally {
            setGuardandoNombre(false);
        }
    };

    if (isGuest) {
        return (
            <div className={styles.pagina}>
                <section className={styles.estadoCaja} aria-label={t('Clasificatoria')}>
                    <Trophy size={32} strokeWidth={2.25} aria-hidden="true" />
                    <h1 className={styles.estadoTitulo}>{t('Compite en la clasificatoria semanal')}</h1>
                    <p className={styles.estadoDesc}>
                        {t('Crea tu cuenta gratuita para sumar puntos en cada comida, subir de liga y desbloquear insignias.')}
                    </p>
                    <Button onClick={() => navigate('/login')}>{t('Crear cuenta gratis')}</Button>
                </section>
            </div>
        );
    }

    return (
        <div className={styles.pagina}>
            <header className={styles.cabecera}>
                <div className={styles.cabeceraTop}>
                    <div className={styles.cabeceraTexto}>
                        <h1 className={styles.titulo}>{t('Clasificatoria')}</h1>
                        <p className={styles.meta}>
                            <span className={styles.puntoVivo} aria-hidden="true" />
                            {datos?.temporada
                                ? `${textoSala(datos.temporada, t)} · ${textoCierre(datos.temporada.cierra_en_s, t)}`
                                : t('Sincronizando tu liga semanal…')}
                        </p>
                    </div>
                    <div className={styles.accionesCabecera}>
                        <Button variant="secondary" size="sm" iconOnly onClick={() => setPrivacidadAbierta(true)} aria-label={t('Privacidad')}>
                            <EyeOff size={16} strokeWidth={2.25} aria-hidden="true" />
                        </Button>
                        <Button size="sm" onClick={alCompartir} disabled={!yo || compartiendo}>
                            <Share2 size={16} strokeWidth={2.25} aria-hidden="true" />
                            {compartiendo ? t('Preparando…') : t('Compartir')}
                        </Button>
                    </div>
                </div>
            </header>

            <div className={styles.controles}>
                <div className={styles.segmentado} role="tablist" aria-label={t('Vista de clasificatoria')}>
                    {[
                        { id: 'semanal', etiqueta: t('Semanal'), icono: Zap },
                        { id: 'general', etiqueta: t('General'), icono: Crown },
                        { id: 'rachas', etiqueta: t('Rachas'), icono: Flame },
                    ].map((op) => {
                        const Icono = op.icono;
                        const activa = tab === op.id;
                        return (
                            <button
                                key={op.id}
                                type="button"
                                role="tab"
                                aria-selected={activa}
                                className={`${styles.tabBtn} ${activa ? styles.tabActiva : ''}`}
                                onClick={() => { setTab(op.id); setVerTodos(false); }}
                            >
                                <Icono size={15} strokeWidth={2.25} aria-hidden="true" />
                                {op.etiqueta}
                            </button>
                        );
                    })}
                </div>

                <div className={styles.controlesPie}>
                    <div className={styles.ambito} role="group" aria-label={t('Ámbito de clasificatoria')}>
                        <button
                            type="button"
                            aria-pressed={scope === 'global'}
                            className={`${styles.ambitoBtn} ${scope === 'global' ? styles.ambitoActivo : ''}`}
                            onClick={() => { setScope('global'); setVerTodos(false); }}
                        >
                            <Globe size={14} strokeWidth={2.25} aria-hidden="true" />
                            {t('Global')}
                        </button>
                        <button
                            type="button"
                            aria-pressed={scope === 'pais'}
                            className={`${styles.ambitoBtn} ${scope === 'pais' ? styles.ambitoActivo : ''}`}
                            onClick={() => { setScope('pais'); setVerTodos(false); }}
                        >
                            <MapPin size={14} strokeWidth={2.25} aria-hidden="true" />
                            {paisUsuario ? t('Mi país ({pais})', { pais: paisUsuario }) : t('Mi país')}
                        </button>
                    </div>
                    {datos?.temporada && (
                        <span className={styles.activos}>
                            {t('{n} activos', { n: formatNumber(datos.temporada.total_jugadores || 0) })}
                        </span>
                    )}
                </div>
            </div>

            <div className={styles.cuerpo}>
            {cargando && !datos && (
                <div className={`${styles.esqueletoLista} ${styles.areaTabla}`} aria-busy="true" aria-label={t('Cargando clasificatoria')}>
                    {[1, 2, 3, 4].map((k) => <div key={k} className={styles.esqueletoFila} />)}
                </div>
            )}

            {!cargando && datos && podio.length === 0 && (
                <section className={`${styles.estadoCaja} ${styles.areaEscenario}`}>
                    <Utensils size={28} strokeWidth={2.25} aria-hidden="true" />
                    <h2 className={styles.estadoTitulo}>{t('Tu tabla está lista para estrenarse')}</h2>
                    <p className={styles.estadoDesc}>
                        {t('Registra tu primera comida o vaso de agua hoy para entrar a la clasificatoria de esta semana.')}
                    </p>
                </section>
            )}

            {podio.length > 0 && (
                <section className={`${styles.escenario} ${styles.areaEscenario}`} aria-label={t('Podio de líderes')}>
                    <div className={styles.escenarioGrid}>
                        {podio.map((fila) => (
                            <PuestoDelPodio
                                key={fila.user_id}
                                fila={fila}
                                tab={tab}
                                bonos={bonosPodio}
                                minimo={minPodioPts}
                                onAbrir={abrirRival}
                            />
                        ))}
                    </div>
                </section>
            )}

            {sinNombreVisible && (
                <section className={`${styles.nombreBanner} ${styles.areaAviso}`} aria-label={t('Nombre en la clasificatoria')}>
                    <p className={styles.nombreBannerTexto}>
                        {t('Apareces como {alias} — Pon tu nombre para la clasificatoria', { alias: yo.alias })}
                    </p>
                    <form onSubmit={guardarNombreRapido} className={styles.nombreBannerForm}>
                        <input
                            type="text"
                            maxLength={40}
                            value={nombreRapido}
                            onChange={(e) => setNombreRapido(e.target.value)}
                            placeholder={t('Tu nombre o apodo')}
                            aria-label={t('Tu nombre o apodo')}
                            className={styles.nombreBannerInput}
                            disabled={guardandoNombre}
                        />
                        <Button type="submit" size="sm" disabled={guardandoNombre}>
                            {guardandoNombre ? t('Guardando…') : t('Guardar')}
                        </Button>
                    </form>
                </section>
            )}

            {yo && yo.posicion && (
                <section className={`${styles.resumen} ${styles.areaTu}`} aria-label={t('Tu posición actual')}>
                    <span className={styles.resumenEtiqueta}>{t('Tu posición')}</span>
                    <div className={styles.resumenFila}>
                        <span className={styles.resumenPos}>#{yo.posicion}</span>
                        <span className={styles.resumenTexto}>
                            <strong>{yo.alias}</strong>
                            <span>{nombreDelRango(yo.rank_key, yo.rank_division, t)}</span>
                        </span>
                        <span className={styles.resumenValor}>{textoValor(valorDe(yo, tab), tab, t, tn)}</span>
                    </div>
                    <div className={styles.resumenRival}>
                        {rival && (
                            <progress
                                className={styles.resumenProg}
                                max={100}
                                value={avanceAlRival(valorDe(yo, tab), rival.diferencia)}
                                aria-label={t('Avance hacia el puesto de arriba')}
                            />
                        )}
                        <span className={styles.resumenNota}>
                            {rival
                                ? t('A {n} de superar a {alias}', {
                                    n: textoValor(Number(rival.diferencia) || 0, tab, t, tn),
                                    alias: rival.alias,
                                })
                                : t('En la cima de esta vista')}
                        </span>
                    </div>
                </section>
            )}

            {tab === 'semanal' && datos?.temporada && podio.length > 0 && (
                <section className={`${styles.premios} ${styles.areaPremios}`} aria-label={t('Premios de la semana')}>
                    <h2 className={styles.premiosTitulo}>
                        <Trophy size={16} strokeWidth={2.25} aria-hidden="true" />
                        {t('Premios de la semana')}
                    </h2>
                    <ol className={styles.premiosLista}>
                        {bonosPodio.slice(0, 3).map((b, i) => (
                            <li key={i} className={`${styles.premioFila} ${[styles.premioOro, styles.premioPlata, styles.premioBronce][i]}`}>
                                <span className={styles.premioPuesto}>{i + 1}</span>
                                <span className={styles.premioNombre}>{[t('Primer puesto'), t('Segundo puesto'), t('Tercer puesto')][i]}</span>
                                <span className={styles.premioBono}>{t('+{n} pts', { n: formatNumber(b) })}</span>
                            </li>
                        ))}
                    </ol>
                    <p className={styles.premiosNota}>
                        {t('Se cobra con un mínimo de {n} pts al cierre de la semana.', { n: formatNumber(minPodioPts) })}
                    </p>
                </section>
            )}

            {tablaResto.length > 0 && (
                <section className={`${styles.bloque} ${styles.areaTabla}`} aria-label={t('Tabla de posiciones')}>
                    <div className={styles.bloqueCabecera}>
                        <h2 className={styles.bloqueTitulo}>{t('Clasificación')}</h2>
                        <span className={styles.bloqueSub}>
                            {tab === 'semanal'
                                ? t('Top 3 con mínimo {n} pts gana bono semanal', { n: minPodioPts })
                                : t('Toca cualquier jugador para comparar Cara a Cara')}
                        </span>
                    </div>
                    <div className={styles.listaMarco}>
                    <div className={styles.listaCabecera} aria-hidden="true">
                        <span>#</span>
                        <span className={styles.listaCabeceraJugador}>{t('Jugador')}</span>
                        <span>{t('Rango')}</span>
                        <span>{scope === 'global' ? t('País') : ''}</span>
                        <span>{tab !== 'rachas' ? t('Racha') : ''}</span>
                        <span className={styles.listaCabeceraValor}>{tab === 'rachas' ? t('Racha') : t('Puntos')}</span>
                    </div>
                    <ul className={styles.lista}>
                        {filasMostradas.map((fila) => (
                            <li key={fila.user_id} className={styles.listaItem}>
                                <button
                                    type="button"
                                    className={`${styles.fila} ${fila.es_yo ? styles.filaYo : ''}`}
                                    onClick={() => abrirRival(fila)}
                                >
                                    <span className={styles.posNum}>{fila.posicion}</span>
                                    <Avatar fila={fila} chico />
                                    <span className={styles.filaInfo}>
                                        <span className={styles.filaNombreLinea}>
                                            <span className={styles.filaAlias}>{fila.alias}</span>
                                            {fila.es_yo && <span className={styles.etiquetaTu}>{t('Tú')}</span>}
                                        </span>
                                        <span className={styles.filaMeta}>
                                            <span className={styles.metaRango}>{nombreDelRango(fila.rank_key, fila.rank_division, t)}</span>
                                            <span className={styles.metaPais}>{scope === 'global' && fila.country_code ? fila.country_code : ''}</span>
                                            <span className={styles.metaRacha}>
                                                {tab !== 'rachas' && fila.racha > 0 ? tn(fila.racha, '{n} día', '{n} días', { n: formatNumber(fila.racha) }) : ''}
                                            </span>
                                        </span>
                                    </span>
                                    <span className={styles.filaMetrica}>{textoValor(valorDe(fila, tab), tab, t, tn)}</span>
                                    <ChevronRight size={16} strokeWidth={2.25} className={styles.chevron} aria-hidden="true" />
                                </button>
                            </li>
                        ))}
                    </ul>
                    </div>
                    {tablaResto.length > FILAS_VISIBLES && (
                        <button type="button" className={styles.verMas} onClick={() => setVerTodos((v) => !v)} aria-expanded={verTodos}>
                            {verTodos ? t('Mostrar menos') : t('Ver todos ({n})', { n: tablaResto.length })}
                            {verTodos
                                ? <ChevronUp size={16} strokeWidth={2.25} aria-hidden="true" />
                                : <ChevronDown size={16} strokeWidth={2.25} aria-hidden="true" />}
                        </button>
                    )}
                </section>
            )}

            {(datos?.misiones?.misiones || []).length > 0 && (
                <section className={`${styles.bloque} ${styles.areaMisiones}`} aria-label={t('Misiones de la semana')}>
                    <div className={styles.bloqueCabecera}>
                        <h2 className={styles.bloqueTitulo}>
                            <Target size={18} strokeWidth={2.25} aria-hidden="true" />
                            {t('Misiones de la semana')}
                        </h2>
                        <span className={styles.bloqueSub}>
                            {t('{done}/{total} completadas · +{bono} pts', {
                                done: datos.misiones.completadas || 0,
                                total: datos.misiones.total || 3,
                                bono: formatNumber(datos.misiones.bono_semana || 0),
                            })}
                        </span>
                    </div>
                    <div className={styles.misionesGrid}>
                        {datos.misiones.misiones.map((m) => {
                            const info = misionesMeta[m.id] || { titulo: m.id, desc: '' };
                            return (
                                <article key={m.id} className={`${styles.misionCard} ${m.completada ? styles.misionHecha : ''}`}>
                                    <div className={styles.misionTop}>
                                        <strong className={styles.misionNombre}>{info.titulo}</strong>
                                        <span className={styles.misionPts}>
                                            {m.completada ? <Check size={12} strokeWidth={3} aria-hidden="true" /> : null} +{m.puntos} pts
                                        </span>
                                    </div>
                                    <span className={styles.misionDesc}>{info.desc}</span>
                                    <progress className={styles.misionProg} max={m.meta} value={m.progreso} />
                                    <div className={styles.misionPie}>
                                        <span>{formatNumber(m.progreso)} / {formatNumber(m.meta)}</span>
                                        <span>{m.completada ? t('Completada') : t('En curso')}</span>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </section>
            )}

            {(datos?.insignias || []).length > 0 && (
                <section className={`${styles.bloque} ${styles.areaInsignias}`} aria-label={t('Vitrina de insignias')}>
                    <div className={styles.bloqueCabecera}>
                        <h2 className={styles.bloqueTitulo}>
                            <Award size={18} strokeWidth={2.25} aria-hidden="true" />
                            {t('Vitrina de insignias')}
                        </h2>
                        <span className={styles.bloqueSub}>
                            {t('{n} de {total} desbloqueadas', {
                                n: datos.insignias.filter((i) => i.desbloqueada).length,
                                total: datos.insignias.length,
                            })}
                        </span>
                    </div>
                    <div className={styles.insigniasGrid}>
                        {datos.insignias.map((ins) => {
                            const info = insigniasMeta[ins.id] || { nombre: ins.id, desc: '', icon: Droplets };
                            const Icono = ins.desbloqueada ? info.icon : Lock;
                            return (
                                <div
                                    key={ins.id}
                                    className={`${styles.insigniaCard} ${ins.desbloqueada ? styles.insigniaActiva : styles.insigniaBloqueada}`}
                                >
                                    <span className={styles.insigniaIcono}>
                                        <Icono size={16} strokeWidth={2.25} aria-hidden="true" />
                                    </span>
                                    <strong className={styles.insigniaNombre}>{info.nombre}</strong>
                                    <span className={styles.insigniaDesc}>{info.desc}</span>
                                    {!ins.desbloqueada && (
                                        <span className={styles.insigniaAvance}>
                                            {formatNumber(ins.progreso)} / {formatNumber(ins.meta)}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}
            </div>

            {duelo && (
                <DueloModal
                    duelo={duelo}
                    cargando={cargandoDuelo}
                    onCerrar={() => setDuelo(null)}
                />
            )}

            {privacidadAbierta && (
                <PrivacidadModal
                    perfil={datos?.mi_perfil}
                    userId={userId}
                    onGuardado={() => {
                        if (typeof invalidarCacheClasificatoria === 'function') invalidarCacheClasificatoria(userId);
                        forzarRef.current = true;
                        setVersion((v) => v + 1);
                    }}
                    onCerrar={() => setPrivacidadAbierta(false)}
                />
            )}
        </div>
    );
}
