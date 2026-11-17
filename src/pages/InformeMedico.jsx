// [P1-PLAN-LOTE-1034 · 2026-11-17] «Informe para tu médico». El dueño: «debe darme algo para mi médico, eso es para
// ahorrar trabajo a médicos». La app NO diagnostica: resume lo que la persona registró (comidas, energía frente a su
// meta, macros, micronutrientes, agua, peso, horarios) para que su médico lo lea en dos minutos, impreso o en PDF.
//
// Las cifras vienen del servidor (`informe_medico.py`, deterministas); el resumen redactado, si lo hay, ya pasó la
// verificación del servidor (sin cifras inventadas ni lenguaje de diagnóstico). Diseño sobrio e imprimible: sin
// insignias ni estrellas. El PDF lleva el mismo texto que la pantalla (`informeMedicoTexto.js`).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Loader2, Share2, Trash2 } from 'lucide-react';
import { fetchWithAuth } from '../config/api';
import { BRAND } from '../data/routeMeta';
import { useAssessment } from '../context/AssessmentContext';
import { formatDate, formatNumber, useT } from '../i18n';
import { bloquesDeLaRedaccion, bloquesDelInforme } from '../utils/informeMedicoTexto';
import styles from './InformeMedico.module.css';

const PERIODOS = [14, 30, 90];

function textoDelMotivo(motivo, t) {
    if (motivo === 'sin_permiso') return t('No lleva resumen redactado porque no has dado permiso para usar la IA de terceros.');
    if (motivo === 'no_verificada') return t('El resumen redactado no pasó nuestras comprobaciones y se omitió.');
    return t('Este informe no lleva resumen redactado: solo tus datos.');
}

export default function InformeMedico() {
    const t = useT();
    const navigate = useNavigate();
    const location = useLocation();
    const { session, userProfile } = useAssessment();
    const uid = session?.user?.id || userProfile?.id || null;
    const tzOffset = useMemo(() => new Date().getTimezoneOffset(), []);

    const [dias, setDias] = useState(30);
    const [informe, setInforme] = useState(null);
    const [lista, setLista] = useState([]);
    const [estado, setEstado] = useState('inicio');   // inicio | generando | abriendo | error
    const [error, setError] = useState('');
    const [pdf, setPdf] = useState(null);
    const pidioRef = useRef(null);

    const fmt = useCallback((n) => (typeof n === 'number' ? formatNumber(n) : String(n ?? '')), []);

    const cargarLista = useCallback(async () => {
        if (!uid) return;
        try {
            const r = await fetchWithAuth(`/api/reports/health/${uid}`);
            if (r.ok) setLista((await r.json())?.informes || []);
        } catch { /* sin red: la lista se queda como estaba */ }
    }, [uid]);

    const abrir = useCallback(async (id) => {
        if (!uid || !id) return;
        setEstado('abriendo');
        setError('');
        try {
            const r = await fetchWithAuth(`/api/reports/health/${uid}/${id}`);
            if (!r.ok) throw new Error(String(r.status));
            setInforme(await r.json());
            setEstado('inicio');
        } catch {
            setEstado('error');
            setError(t('No pudimos abrir ese informe. Inténtalo de nuevo.'));
        }
    }, [uid, t]);

    useEffect(() => { cargarLista(); }, [cargarLista]);

    // Abierto por el coach: `?id=` trae el informe que acaba de preparar.
    useEffect(() => {
        const id = new URLSearchParams(location.search).get('id');
        if (id && pidioRef.current !== id) {
            pidioRef.current = id;
            abrir(id);
        }
    }, [location.search, abrir]);

    const generar = async () => {
        if (!uid || estado === 'generando') return;
        setEstado('generando');
        setError('');
        try {
            const r = await fetchWithAuth(`/api/reports/health/${uid}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dias, con_redaccion: true, tzOffset }),
            });
            const body = await r.json().catch(() => null);
            if (r.status === 429) throw new Error(t('Ya generaste 3 informes hoy. Podrás generar otro mañana.'));
            if (!r.ok || !body) throw new Error(t('No pudimos generar el informe. Inténtalo de nuevo.'));
            setInforme(body);
            setEstado('inicio');
            cargarLista();
        } catch (e) {
            setEstado('error');
            setError(e?.message || t('No pudimos generar el informe. Inténtalo de nuevo.'));
        }
    };

    const borrar = async (id) => {
        if (!uid || !id) return;
        try {
            const r = await fetchWithAuth(`/api/reports/health/${uid}/${id}`, { method: 'DELETE' });
            if (r.ok) {
                setLista((xs) => xs.filter((x) => x.id !== id));
                if (informe?.id === id) setInforme(null);
            }
        } catch { /* se queda en la lista */ }
    };

    const periodoTexto = (p) => (p?.desde && p?.hasta
        ? t('Del {a} al {b}', {
            a: formatDate(`${p.desde}T12:00:00`, { day: 'numeric', month: 'short', year: 'numeric' }),
            b: formatDate(`${p.hasta}T12:00:00`, { day: 'numeric', month: 'short', year: 'numeric' }),
        })
        : '');

    const aviso = t('Este informe resume lo que la persona registró en {app} (comidas, agua, peso). Son datos autorreportados y estimaciones. No es un diagnóstico ni sustituye la valoración de un profesional de la salud.', { app: BRAND });
    const bloques = useMemo(() => (informe ? [
        ...bloquesDeLaRedaccion(informe.narrative, { t }),
        ...bloquesDelInforme(informe.data, { t, fmt }),
    ] : []), [informe, t, fmt]);

    // El PDF se prepara al abrir el informe: `navigator.share` exige el gesto del usuario, y el gesto no espera.
    useEffect(() => {
        let vivo = true;
        setPdf(null);
        if (!informe) return undefined;
        import('../utils/informeMedicoPdf').then(({ pdfDelInforme }) => pdfDelInforme({
            titulo: t('Informe para tu médico'),
            subtitulo: `${periodoTexto(informe.data?.periodo)} · ${t('Generado el {f}', { f: formatDate(informe.created_at || new Date(), { day: 'numeric', month: 'long', year: 'numeric' }) })}`,
            aviso,
            bloques,
        })).then((blob) => {
            if (vivo) setPdf(new File([blob], `informe-bioboros-${informe.data?.periodo?.hasta || 'hoy'}.pdf`, { type: 'application/pdf' }));
        }).catch(() => { /* sin PDF: el botón queda desactivado */ });
        return () => { vivo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- `periodoTexto` y `aviso` derivan de `informe` y `t`
    }, [informe, bloques]);

    const compartir = async () => {
        if (!pdf) return;
        try {
            if (navigator.canShare?.({ files: [pdf] })) {
                await navigator.share({ files: [pdf], title: t('Informe para tu médico') });
                return;
            }
        } catch (e) {
            if (e?.name === 'AbortError') return;
        }
        const url = URL.createObjectURL(pdf);
        const a = document.createElement('a');
        a.href = url;
        a.download = pdf.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
    };

    const semanas = informe?.data?.energia?.por_semana || [];
    const maxKcal = Math.max(1, ...semanas.map((s) => s.kcal_media || 0), informe?.data?.energia?.meta_media || 0);
    const semanasMeta = informe?.data?.adherencia?.semanas || [];

    return (
        <main className={styles.pagina} aria-labelledby="informe-titulo">
            <div className={styles.barra}>
                <button type="button" className={styles.volver} onClick={() => navigate(-1)} aria-label={t('Volver')}>
                    <ArrowLeft size={20} aria-hidden="true" />
                </button>
                <h1 id="informe-titulo" className={styles.titulo}>{t('Informe para tu médico')}</h1>
            </div>
            <p className={styles.intro}>{t('Un resumen de lo que registraste para llevárselo a tu médico o nutricionista. No es un diagnóstico.')}</p>

            <section className={styles.generar} aria-label={t('Generar un informe')}>
                <div className={styles.periodos} role="radiogroup" aria-label={t('Periodo del informe')}>
                    {PERIODOS.map((n) => (
                        <button key={n} type="button" role="radio" aria-checked={dias === n}
                            className={`${styles.periodo}${dias === n ? ` ${styles.periodoActivo}` : ''}`}
                            onClick={() => setDias(n)}>
                            {t('{n} días', { n })}
                        </button>
                    ))}
                </div>
                <button type="button" className={styles.primario} onClick={generar} disabled={!uid || estado === 'generando'}>
                    {estado === 'generando'
                        ? <><Loader2 size={18} className="spin-fast" aria-hidden="true" /> {t('Preparando tu informe…')}</>
                        : <><FileText size={18} aria-hidden="true" /> {t('Generar')}</>}
                </button>
                {error && <p className={styles.error} role="alert">{error}</p>}
            </section>

            {estado === 'abriendo' && <p className={styles.nota}><Loader2 size={16} className="spin-fast" aria-hidden="true" /> {t('Abriendo el informe…')}</p>}

            {informe && (
                <article className={styles.informe} aria-label={t('Informe para tu médico')} data-testid="informe-medico">
                    <header className={styles.cabecera}>
                        <p className={styles.periodoTexto}>{periodoTexto(informe.data?.periodo)}</p>
                        <button type="button" className={styles.secundario} onClick={compartir} disabled={!pdf}>
                            <Share2 size={16} aria-hidden="true" /> {t('Compartir PDF')}
                        </button>
                    </header>
                    <p className={styles.aviso} data-testid="informe-aviso">{aviso}</p>
                    {informe.status !== 'ready' && (
                        <p className={styles.nota} data-testid="informe-solo-datos">
                            {textoDelMotivo(informe.motivo, t)}
                        </p>
                    )}
                    {semanas.length > 1 && (
                        <figure className={styles.grafica} aria-label={t('Energía media por semana frente a la meta')}>
                            <figcaption>{t('Energía media por semana frente a la meta')}</figcaption>
                            {semanas.map((s) => (
                                <div key={s.numero} className={styles.fila}>
                                    <span className={styles.etiqueta}>{t('S{n}', { n: s.numero })}</span>
                                    <span className={styles.pista}>
                                        <span className={styles.barraValor} style={{ width: `${Math.round(100 * (s.kcal_media || 0) / maxKcal)}%` }} />
                                        {informe.data?.energia?.meta_media ? (
                                            <span className={styles.meta} style={{ left: `${Math.round(100 * informe.data.energia.meta_media / maxKcal)}%` }} />
                                        ) : null}
                                    </span>
                                    <span className={styles.valor}>{t('{n} kcal', { n: fmt(s.kcal_media) })}</span>
                                </div>
                            ))}
                        </figure>
                    )}
                    {semanasMeta.length > 1 && (
                        <figure className={styles.grafica} aria-label={t('Días en meta por semana')}>
                            <figcaption>{t('Días en meta por semana')}</figcaption>
                            {semanasMeta.map((s) => (
                                <div key={s.numero} className={styles.fila}>
                                    <span className={styles.etiqueta}>{t('S{n}', { n: s.numero })}</span>
                                    <span className={styles.pista}>
                                        <span className={styles.barraValor} style={{ width: `${Math.round(100 * (s.dias_en_meta || 0) / 7)}%` }} />
                                    </span>
                                    <span className={styles.valor}>{t('{n} de 7', { n: fmt(s.dias_en_meta) })}</span>
                                </div>
                            ))}
                        </figure>
                    )}
                    {bloques.map((b) => (
                        <section key={b.id} className={styles.bloque} data-bloque={b.id}>
                            <h2 className={styles.bloqueTitulo}>{b.titulo}</h2>
                            <ul className={styles.lineas}>
                                {b.lineas.map((l, i) => <li key={i}>{l}</li>)}
                            </ul>
                        </section>
                    ))}
                </article>
            )}

            {lista.length > 0 && (
                <section className={styles.anteriores} aria-labelledby="informes-anteriores">
                    <h2 id="informes-anteriores" className={styles.bloqueTitulo}>{t('Informes anteriores')}</h2>
                    <ul className={styles.listaInformes}>
                        {lista.map((x) => (
                            <li key={x.id} className={styles.itemInforme}>
                                <button type="button" className={styles.abrirInforme} onClick={() => abrir(x.id)}>
                                    <span>{periodoTexto(x.periodo)}</span>
                                    <small>{formatDate(x.created_at, { day: 'numeric', month: 'short' })}{x.status !== 'ready' ? ` · ${t('solo datos')}` : ''}</small>
                                </button>
                                <button type="button" className={styles.borrar} onClick={() => borrar(x.id)} aria-label={t('Borrar este informe')}>
                                    <Trash2 size={16} aria-hidden="true" />
                                </button>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </main>
    );
}
