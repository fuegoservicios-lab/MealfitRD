// [P1-PLAN-LOTE-103 · 2026-09-18] «Micros de hoy»: el hermano del contador de macros, para los OCHO micros que
// el dueño eligió (fibra, sodio, potasio, calcio, hierro, vitamina C, A y D).
//
// Cómo sabe lo que sabe: el backend resuelve los `ingredients` guardados en cada comida registrada contra el
// catálogo (mismo resolutor que el informe de micros del plan) y devuelve por comida `micros` o `null`; una
// comida por foto o con macros propias NO trae ingredientes y por tanto no trae micros. Esta tarjeta lo dice
// —«con datos de 2 de 3 comidas»— en vez de pintar un cero que parezca medido.
//
// Metas: `/api/nutrition/targets.micros` (DRI por sexo/edad/embarazo). El sodio es TECHO (OMS <2000 mg): su
// barra avisa al pasarse; el resto es SUELO y celebra al llegar. Sin metas (perfil incompleto) se muestran los
// totales sin barra: nunca una barra contra un cero inventado.
import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { FlaskConical } from 'lucide-react';
import { fetchWithAuth } from '../../config/api';
import { formatNumber, useT, useTn } from '../../i18n';
import styles from './MicrosTracker.module.css';

// Orden de pantalla = orden del backend (diary_micros.MICROS_CONTADOR). La etiqueta es función: un `t()` en
// ámbito de módulo se congela en español.
const _FILAS = (t) => [
    { key: 'fiber_g', label: t('Fibra'), unit: 'g' },
    { key: 'sodium_mg', label: t('Sodio'), unit: 'mg' },
    { key: 'potassium_mg', label: t('Potasio'), unit: 'mg' },
    { key: 'calcium_mg', label: t('Calcio'), unit: 'mg' },
    { key: 'iron_mg', label: t('Hierro'), unit: 'mg' },
    { key: 'vit_c_mg', label: t('Vitamina C'), unit: 'mg' },
    { key: 'vit_a_mcg', label: t('Vitamina A'), unit: 'mcg' },
    { key: 'vit_d_mcg', label: t('Vitamina D'), unit: 'mcg' },
];

const _hoyUrl = (userId) => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `/api/diary/consumed/${userId}?date=${y}-${m}-${d}&tzOffset=${now.getTimezoneOffset()}`;
};

const _fmt = (v, unit) => {
    const n = Number(v) || 0;
    // mg/mcg enteros; gramos y valores pequeños con un decimal
    if (unit === 'g' || n < 10) return formatNumber(Math.round(n * 10) / 10);
    return formatNumber(Math.round(n));
};

const MicrosTracker = ({ userId, flatOnMobile = false }) => {
    const t = useT();
    const tn = useTn();
    const [datos, setDatos] = useState(null);     // { micros, coverage } · null = cargando
    const [metas, setMetas] = useState(null);     // { key: { target, kind, unit } } · null = sin metas

    const cargarHoy = useCallback(async () => {
        if (!userId || userId === 'guest') { setDatos({ micros: null, coverage: { con_datos: 0, total: 0 } }); return; }
        try {
            const r = await fetchWithAuth(_hoyUrl(userId));
            const d = await r.json().catch(() => null);
            const tot = d?.totals || {};
            setDatos({ micros: tot.micros || null, coverage: tot.micros_coverage || { con_datos: 0, total: (d?.meals || []).length } });
        } catch {
            setDatos((prev) => prev || { micros: null, coverage: { con_datos: 0, total: 0 } });
        }
    }, [userId]);

    const cargarMetas = useCallback(async () => {
        try {
            const r = await fetchWithAuth('/api/nutrition/targets');
            const d = await r.json().catch(() => null);
            setMetas(d?.micros && Object.keys(d.micros).length ? d.micros : null);
        } catch {
            setMetas(null);
        }
    }, []);

    useEffect(() => { cargarHoy(); cargarMetas(); }, [cargarHoy, cargarMetas]);

    // Mismas señales que el contador de macros: registrar (modal/escáner/coach), borrar (TrackingProgress avisa con
    // `mealfit:diary-changed`), volver a la pestaña; y las metas, cuando Configuración cambia peso/edad/sexo.
    useEffect(() => {
        const alVolver = () => { if (document.visibilityState === 'visible') cargarHoy(); };
        window.addEventListener('mealfit:refresh-inventory', cargarHoy);
        window.addEventListener('mealfit:diary-changed', cargarHoy);
        window.addEventListener('mealfit:targets-changed', cargarMetas);
        document.addEventListener('visibilitychange', alVolver);
        return () => {
            window.removeEventListener('mealfit:refresh-inventory', cargarHoy);
            window.removeEventListener('mealfit:diary-changed', cargarHoy);
            window.removeEventListener('mealfit:targets-changed', cargarMetas);
            document.removeEventListener('visibilitychange', alVolver);
        };
    }, [cargarHoy, cargarMetas]);

    const cov = datos?.coverage || { con_datos: 0, total: 0 };
    const sinDatos = !datos || !datos.micros || cov.con_datos === 0;
    const subtitulo = !datos
        ? t('Cargando registros...')
        : cov.total === 0
            ? t('Registra una comida y aquí verás sus micros.')
            : cov.con_datos === 0
                ? t('Ninguna de tus comidas de hoy trae micros (foto o macros propias).')
                : tn(cov.con_datos, 'Con datos de {n} de {total} comidas', 'Con datos de {n} de {total} comidas', { n: cov.con_datos, total: cov.total });

    return (
        <section className={flatOnMobile ? `${styles.card} ${styles.flatMobile}` : styles.card} aria-labelledby="micros-hoy-titulo">
            <div className={styles.head}>
                <div className={styles.badge} aria-hidden="true"><FlaskConical size={22} strokeWidth={2.4} /></div>
                <div>
                    <h2 id="micros-hoy-titulo" className={styles.title}>{t('Micros de hoy')}</h2>
                    <p className={styles.sub}>{subtitulo}</p>
                </div>
            </div>

            <ul className={styles.list}>
                {_FILAS(t).map((f) => {
                    const valor = sinDatos ? 0 : Number(datos.micros?.[f.key] || 0);
                    const meta = metas?.[f.key];
                    const target = meta ? Number(meta.target) || 0 : 0;
                    const ratio = target > 0 ? valor / target : 0;
                    const techo = meta?.kind === 'ceiling';
                    const estado = !meta || sinDatos ? '' : techo
                        ? (ratio > 1 ? styles.over : ratio > 0.85 ? styles.near : styles.ok)
                        : (ratio >= 1 ? styles.done : '');
                    return (
                        <li key={f.key} className={styles.row}>
                            <div className={styles.rowTop}>
                                <span className={styles.label}>{f.label}{techo && <span className={styles.tag}>{t('máx.')}</span>}</span>
                                <span className={styles.value}>
                                    <b>{_fmt(valor, f.unit)}</b>
                                    {meta ? ` / ${_fmt(target, f.unit)} ${f.unit}` : ` ${f.unit}`}
                                </span>
                            </div>
                            <div className={styles.track} role="progressbar" aria-label={f.label} aria-valuemin={0} aria-valuemax={target || undefined} aria-valuenow={Math.round(valor)}>
                                <div className={`${styles.fill} ${estado}`} style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }} />
                            </div>
                        </li>
                    );
                })}
            </ul>

            {datos && cov.total > cov.con_datos && cov.con_datos > 0 && (
                <p className={styles.note}>{t('Las comidas registradas por foto o con macros propias no traen micros.')}</p>
            )}
            {datos && !metas && !sinDatos && (
                <p className={styles.note}>{t('Sin metas todavía: completa sexo y edad en Configuración.')}</p>
            )}
        </section>
    );
};

MicrosTracker.propTypes = {
    userId: PropTypes.string,
    flatOnMobile: PropTypes.bool,
};

export default MicrosTracker;
