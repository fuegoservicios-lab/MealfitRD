// [P1-PLAN-LOTE-1072 · 2026-11-17] El contenido del «Informe para tu médico», el MISMO en la hoja (desde el calendario
// y Ajustes) y en la ruta `/dashboard/informe` (el enlace del coach). El dueño: «cuando le doy al botón me lleva a otra
// página y eso lo veo raro» y «visualmente no me gusta». Ahora: qué incluye antes de generarlo, el periodo como un
// selector de tres partes con sus fechas, el botón principal índigo del sistema y, con el informe listo, «Compartir
// PDF» como acción principal.
//
// Lo de siempre (lote 1034): las cifras vienen del servidor (`informe_medico.py`, deterministas); el resumen redactado,
// si lo hay, ya pasó la verificación del servidor. El informe en sí es sobrio e imprimible: sin insignias ni estrellas.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Clock, Droplets, FileText, Flame, Leaf, Loader2, RotateCcw, Share2, Trash2 } from 'lucide-react';
import { fetchWithAuth } from '../../config/api';
import { BRAND } from '../../data/routeMeta';
import { useAssessment } from '../../context/AssessmentContext';
import { formatDate, formatNumber, getLocale, useT } from '../../i18n';
import { bloquesDeLaRedaccion, bloquesDelInforme } from '../../utils/informeMedicoTexto';
import Button from '../ui/Button';
import { fechasDelPeriodo } from './fechasDelPeriodo';
import styles from './InformeMedicoPanel.module.css';

const PERIODOS = [14, 30, 90];

function textoDelMotivo(motivo, t) {
    if (motivo === 'sin_permiso') return t('No lleva resumen redactado porque no has dado permiso para usar la IA de terceros.');
    if (motivo === 'no_verificada') return t('El resumen redactado no pasó nuestras comprobaciones y se omitió.');
    return t('Este informe no lleva resumen redactado: solo tus datos.');
}

export default function InformeMedicoPanel({ idInicial = null, tituloId = 'informe-titulo', nivelTitulo = 2 }) {
    const t = useT();
    const { session, userProfile } = useAssessment();
    const uid = session?.user?.id || userProfile?.id || null;
    const tzOffset = useMemo(() => new Date().getTimezoneOffset(), []);

    const [dias, setDias] = useState(30);
    const [informe, setInforme] = useState(null);
    const [lista, setLista] = useState([]);
    const [estado, setEstado] = useState('inicio');   // inicio | generando | abriendo | error
    const [faseCarga, setFaseCarga] = useState(0);
    const [error, setError] = useState('');
    const [pdf, setPdf] = useState(null);
    const pidioRef = useRef(null);

    // [P2-I18N-MEMOS-CONGELADOS] sin memo: cuatro cadenas por render, siempre en el idioma vivo
    const FASES_CARGA = [
        t('Analizando tus registros…'),
        t('Calculando tendencias y nutrientes…'),
        t('Redactando resumen clínico…'),
        t('Verificando cifras y preparando PDF…'),
    ];

    useEffect(() => {
        if (estado !== 'generando') {
            setFaseCarga(0);
            return undefined;
        }
        const id = setInterval(() => {
            setFaseCarga((n) => (n < FASES_CARGA.length - 1 ? n + 1 : n));
        }, 3500);
        return () => clearInterval(id);
    }, [estado, FASES_CARGA.length]);

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
        if (idInicial && pidioRef.current !== idInicial) {
            pidioRef.current = idInicial;
            abrir(idInicial);
        }
    }, [idInicial, abrir]);

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
            a: formatDate(`${p.desde}T12:00:00`, { day: 'numeric', month: 'short' }),
            b: formatDate(`${p.hasta}T12:00:00`, { day: 'numeric', month: 'short', year: 'numeric' }),
        })
        : '');

    const aviso = t('Este informe resume lo que la persona registró en {app} (comidas, agua, peso). Son datos autorreportados y estimaciones. No es un diagnóstico ni sustituye la valoración de un profesional de la salud.', { app: BRAND });
    // [P2-I18N-MEMOS-CONGELADOS] `locale` viaja en las opciones (y en las deps): sin él, el texto del informe se quedaba
    // en el idioma anterior hasta recargar
    const locale = getLocale();
    const bloques = useMemo(() => (informe ? [
        ...bloquesDeLaRedaccion(informe.narrative, { t, locale }),
        ...bloquesDelInforme(informe.data, { t, fmt, locale }),
    ] : []), [informe, t, fmt, locale]);

    // [P2-I18N-MEMOS-CONGELADOS] Las gráficas del PDF se rotulan DENTRO del efecto que arma el PDF (no en un memo, que
    // congelaba los títulos en el idioma anterior): el efecto se repite al cambiar el idioma.
    const graficasDelPdf = () => {
        if (!informe?.data) return [];
        const out = [];
        const sems = informe.data.energia?.por_semana || [];
        if (sems.length > 1) {
            const metaM = informe.data.energia?.meta_media || 0;
            const top = Math.max(1, ...sems.map((s) => s.kcal_media || 0), metaM);
            out.push({
                titulo: t('Energía media por semana frente a la meta'),
                filas: sems.map((s) => ({
                    etiqueta: t('S{n}', { n: s.numero }),
                    valorTexto: t('{n} kcal', { n: fmt(s.kcal_media) }),
                    pct: Math.round((100 * (s.kcal_media || 0)) / top),
                    metaPct: metaM ? Math.round((100 * metaM) / top) : undefined,
                })),
            });
        }
        const semsMeta = informe.data.adherencia?.semanas || [];
        if (semsMeta.length > 1) {
            out.push({
                titulo: t('Días en meta por semana'),
                filas: semsMeta.map((s) => ({
                    etiqueta: t('S{n}', { n: s.numero }),
                    valorTexto: t('{n} de 7', { n: fmt(s.dias_en_meta) }),
                    pct: Math.round((100 * (s.dias_en_meta || 0)) / 7),
                })),
            });
        }
        return out;
    };

    // El PDF se prepara al abrir el informe: `navigator.share` exige el gesto del usuario, y el gesto no espera.
    useEffect(() => {
        let vivo = true;
        setPdf(null);
        if (!informe) return undefined;
        import('../../utils/informeMedicoPdf').then(({ pdfDelInforme }) => pdfDelInforme({
            titulo: t('Informe para tu médico'),
            subtitulo: `${periodoTexto(informe.data?.periodo)} · ${t('Generado el {f}', { f: formatDate(informe.created_at || new Date(), { day: 'numeric', month: 'long', year: 'numeric' }) })}`,
            aviso,
            bloques,
            graficas: graficasDelPdf(),
        })).then((blob) => {
            if (vivo) setPdf(new File([blob], `informe-bioboros-${informe.data?.periodo?.hasta || 'hoy'}.pdf`, { type: 'application/pdf' }));
        }).catch(() => { /* sin PDF: el botón queda desactivado */ });
        return () => { vivo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- `periodoTexto`, `aviso` y las gráficas derivan de `informe`, `t` y el idioma
    }, [informe, bloques, locale]);

    // [P1-PLAN-LOTE-1059 · plan 1036.5] solo se CUENTA que se compartió (nada del contenido sale del teléfono)
    const anotarCompartido = () => {
        if (!uid || !informe?.id) return;
        fetchWithAuth(`/api/reports/health/${uid}/${informe.id}/shared`, { method: 'POST' }).catch(() => {});
    };
    const compartir = async () => {
        if (!pdf) return;
        try {
            if (navigator.canShare?.({ files: [pdf] })) {
                await navigator.share({ files: [pdf], title: t('Informe para tu médico') });
                anotarCompartido();
                return;
            }
        } catch (e) {
            if (e?.name === 'AbortError') return;
        }
        anotarCompartido();
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
    const Titulo = nivelTitulo === 1 ? 'h1' : 'h2';
    const INCLUYE = [
        { Icono: Flame, texto: t('Calorías y macros frente a tu meta') },
        { Icono: Leaf, texto: t('Vitaminas y minerales') },
        { Icono: Droplets, texto: t('Agua y peso') },
        { Icono: Clock, texto: t('Horarios de tus comidas') },
    ];

    return (
        <div className={styles.panel}>
            <header className={styles.cabecera}>
                <span className={styles.icono} aria-hidden="true"><FileText size={22} strokeWidth={2.25} /></span>
                <div className={styles.cabeceraTexto}>
                    <Titulo id={tituloId} className={styles.titulo}>{t('Informe para tu médico')}</Titulo>
                    <p className={styles.intro}>{t('Para tu médico o nutricionista. No es un diagnóstico.')}</p>
                </div>
            </header>

            {!informe && (
                <section className={styles.generar} aria-label={t('Generar un informe')}>
                    <p className={styles.rotulo}>{t('Qué incluye')}</p>
                    <ul className={styles.incluye}>
                        {INCLUYE.map(({ Icono, texto }) => (
                            <li key={texto}><Icono size={16} strokeWidth={2.25} aria-hidden="true" />{texto}</li>
                        ))}
                    </ul>

                    <p className={styles.rotulo}>{t('Periodo')}</p>
                    <div className={styles.periodos} role="radiogroup" aria-label={t('Periodo del informe')}>
                        {PERIODOS.map((n) => (
                            <button key={n} type="button" role="radio" aria-checked={dias === n}
                                className={`${styles.periodo}${dias === n ? ` ${styles.periodoActivo}` : ''}`}
                                onClick={() => setDias(n)}>
                                {t('{n} días', { n })}
                            </button>
                        ))}
                    </div>
                    <p className={styles.fechas}>{periodoTexto(fechasDelPeriodo(dias))}</p>

                    <Button variant="primary" block onClick={generar} disabled={!uid || estado === 'generando'}>
                        {estado === 'generando'
                            ? <><Loader2 size={18} className="spin-fast" aria-hidden="true" /> {t('Preparando tu informe…')}</>
                            : <><FileText size={18} aria-hidden="true" /> {t('Generar informe')}</>}
                    </Button>
                    {estado === 'generando' && (
                        <p className={styles.progresoCarga} role="status" aria-live="polite">
                            {FASES_CARGA[faseCarga]}
                        </p>
                    )}
                    <p className={styles.pie}>{t('Listo en segundos para compartir en PDF.')}</p>
                </section>
            )}

            {error && <p className={styles.error} role="alert">{error}</p>}
            {estado === 'abriendo' && <p className={styles.nota}><Loader2 size={16} className="spin-fast" aria-hidden="true" /> {t('Abriendo el informe…')}</p>}

            {informe && (
                <article className={styles.informe} aria-label={t('Informe para tu médico')} data-testid="informe-medico">
                    <p className={styles.periodoTexto}>{periodoTexto(informe.data?.periodo)}</p>
                    <div className={styles.acciones}>
                        <Button variant="primary" block onClick={compartir} disabled={!pdf}>
                            <Share2 size={18} aria-hidden="true" /> {t('Compartir PDF')}
                        </Button>
                        <Button variant="text" onClick={() => { setInforme(null); setError(''); setEstado('inicio'); }}>
                            <RotateCcw size={16} aria-hidden="true" /> {t('Nuevo informe')}
                        </Button>
                    </div>
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
                            <h3 className={styles.bloqueTitulo}>{b.titulo}</h3>
                            <ul className={styles.lineas}>
                                {b.lineas.map((l, i) => <li key={i}>{l}</li>)}
                            </ul>
                        </section>
                    ))}
                </article>
            )}

            {lista.length > 0 && (
                <section className={styles.anteriores} aria-labelledby={`${tituloId}-anteriores`}>
                    <p id={`${tituloId}-anteriores`} className={styles.rotulo}>{t('Informes anteriores')}</p>
                    <ul className={styles.listaInformes}>
                        {lista.map((x) => (
                            <li key={x.id} className={styles.itemInforme}>
                                <button type="button" className={styles.abrirInforme} onClick={() => abrir(x.id)}>
                                    <FileText size={16} aria-hidden="true" className={styles.abrirIcono} />
                                    <span className={styles.abrirTexto}>
                                        <span>{periodoTexto(x.periodo)}</span>
                                        <small>{t('Generado el {f}', { f: formatDate(x.created_at, { day: 'numeric', month: 'short' }) })}{x.status !== 'ready' ? ` · ${t('solo datos')}` : ''}</small>
                                    </span>
                                </button>
                                <button type="button" className={styles.borrar} onClick={() => borrar(x.id)} aria-label={t('Borrar este informe')}>
                                    <Trash2 size={16} aria-hidden="true" />
                                </button>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
}

InformeMedicoPanel.propTypes = {
    idInicial: PropTypes.string,
    tituloId: PropTypes.string,
    nivelTitulo: PropTypes.oneOf([1, 2]),
};
