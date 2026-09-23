// [P1-PLAN-LOTE-103 · 2026-09-18 · fusionado P1-PLAN-LOTE-105] Los OCHO micros del dueño (fibra, sodio, potasio,
// calcio, hierro, vitamina C, A y D), pintados a partir de lo que ya calculó el servidor.
//
// Nació como tarjeta propia («Micros de hoy») con su propio fetch. En el lote 105 se FUSIONA con el contador
// de macros: una sola tarjeta («Tus macros y micros de hoy»), un solo fetch del día, y la misma lista sirve
// para el diario de días anteriores, que hasta entonces solo enseñaba las macros. Por eso este fichero ya no
// pide nada: recibe `micros` (totales del día), `coverage` (con cuántas comidas se calculó) y `metas`, y pinta.
//
// Cómo sabe lo que sabe: el backend resuelve los `ingredients` guardados en cada comida registrada contra el
// catálogo (mismo resolutor que el informe de micros del plan) y devuelve por comida `micros` o `null`; una
// comida por foto o con macros propias NO trae ingredientes y por tanto no trae micros. La lista lo dice
// —«con datos de 2 de 3 comidas»— en vez de pintar un cero que parezca medido.
//
// Metas: `/api/nutrition/targets.micros` (DRI por sexo/edad/embarazo). El sodio es TECHO (OMS <2000 mg): su
// barra avisa al pasarse; el resto es SUELO y celebra al llegar. Sin metas se muestran los totales sin barra:
// nunca una barra contra un cero inventado.
import PropTypes from 'prop-types';
import { useT } from '../../i18n';
import { formatoMicro, filasMicros } from './microsShared';
import styles from './MicrosList.module.css';
// `resumirMicros`, `useMicrosSubtitulo` y `filasMicros` viven en `microsShared.js` (no son componentes: react-refresh)

const MicrosList = ({ micros, coverage, metas, compact = false, showNotes = true }) => {
    const t = useT();
    const cov = coverage || { con_datos: 0, total: 0 };
    const sinDatos = !micros || cov.con_datos === 0;
    const hayMetas = !!(metas && Object.keys(metas).length);

    return (
        <div className={compact ? `${styles.wrap} ${styles.compact}` : styles.wrap}>
            <ul className={styles.list}>
                {filasMicros(t).map((f) => {
                    const valor = sinDatos ? 0 : Number(micros?.[f.key] || 0);
                    const meta = hayMetas ? metas[f.key] : null;
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
                                    <b>{formatoMicro(valor, f.unit)}</b>
                                    {meta ? ` / ${formatoMicro(target, f.unit)} ${f.unit}` : ` ${f.unit}`}
                                </span>
                            </div>
                            <div className={styles.track} role="progressbar" aria-label={f.label} aria-valuemin={0} aria-valuemax={target || undefined} aria-valuenow={Math.round(valor)}>
                                <div className={`${styles.fill} ${estado}`} style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }} />
                            </div>
                        </li>
                    );
                })}
            </ul>

            {showNotes && coverage && cov.total > cov.con_datos && cov.con_datos > 0 && (
                <p className={styles.note}>{t('Las comidas registradas por foto o con macros propias no traen micros.')}</p>
            )}
            {showNotes && coverage && !hayMetas && !sinDatos && (
                <p className={styles.note}>{t('Sin metas todavía: completa sexo y edad en Configuración.')}</p>
            )}
        </div>
    );
};

MicrosList.propTypes = {
    micros: PropTypes.object,
    coverage: PropTypes.shape({ con_datos: PropTypes.number, total: PropTypes.number }),
    metas: PropTypes.object,
    compact: PropTypes.bool,
    showNotes: PropTypes.bool,
};

export default MicrosList;
