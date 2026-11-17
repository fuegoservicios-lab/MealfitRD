// [P1-PLAN-LOTE-1068 · 2026-11-17] La escalera de rangos (petición del dueño): al tocar la insignia se ven los cinco
// rangos, cuántas estrellas pide cada uno y cómo llegar al siguiente. Mecánica: las estrellas son por semana
// (3 / 5 / 7 días en meta → 1 / 2 / 3), así que el camino se cuenta en SEMANAS: con semanas perfectas y a tu ritmo.
// Los umbrales son los del servidor (`progreso_semanas.RANGOS`); un test vigila que no se separen.
import PropTypes from 'prop-types';
import { Check, Lock, Star, Trophy } from 'lucide-react';
import Modal from '../common/Modal';
import { formatNumber, useT, useTn } from '../../i18n';
import styles from './EscaleraDeRangos.module.css';

export const ESCALERA = [
    { clave: 'bronce', desde: 0 },
    { clave: 'plata', desde: 10 },
    { clave: 'oro', desde: 25 },
    { clave: 'platino', desde: 50 },
    { clave: 'diamante', desde: 100 },
];
const ESTRELLAS_POR_SEMANA_MAX = 3;

/** Dónde estás en la escalera: rango actual, siguiente y avance (0-1) dentro del tramo. Puro, para el test. */
export function posicionEnLaEscalera(estrellas) {
    const total = Math.max(0, Number(estrellas) || 0);
    let i = 0;
    for (let k = 0; k < ESCALERA.length; k++) if (total >= ESCALERA[k].desde) i = k;
    const actual = ESCALERA[i];
    const siguiente = ESCALERA[i + 1] || null;
    const faltan = siguiente ? siguiente.desde - total : 0;
    const avance = siguiente ? (total - actual.desde) / (siguiente.desde - actual.desde) : 1;
    return { indice: i, actual, siguiente, faltan, avance: Math.min(1, Math.max(0, avance)), total };
}

/** Semanas para juntar `faltan` estrellas: con semanas perfectas y a tu ritmo (estrellas por semana cerrada). */
export function semanasHasta(faltan, { estrellas = 0, semanasCerradas = 0 } = {}) {
    if (!(faltan > 0)) return { perfectas: 0, aTuRitmo: null };
    const perfectas = Math.ceil(faltan / ESTRELLAS_POR_SEMANA_MAX);
    const ritmo = semanasCerradas > 0 ? estrellas / semanasCerradas : 0;
    return { perfectas, aTuRitmo: ritmo > 0 ? Math.ceil(faltan / ritmo) : null };
}

export function EscaleraDeRangos({ abierta, onCerrar, estrellas, semanasCerradas }) {
    const t = useT();
    const tn = useTn();
    const nombre = (clave) => ({
        bronce: t('Bronce'), plata: t('Plata'), oro: t('Oro'), platino: t('Platino'), diamante: t('Diamante'),
    })[clave] || '';
    const pos = posicionEnLaEscalera(estrellas);
    const camino = semanasHasta(pos.faltan, { estrellas: pos.total, semanasCerradas });
    // Relleno del raíl: tramos completos + lo avanzado en el actual, contado desde abajo (Bronce).
    const tramos = ESCALERA.length - 1;
    const relleno = Math.min(1, (pos.indice + (pos.siguiente ? pos.avance : 0)) / tramos);

    return (
        <Modal isOpen={abierta} onClose={onCerrar} titleId="escalera-rangos-titulo" isBottomSheetOnMobile maxWidth="440px">
            <div className={styles.hoja} style={{ '--avance': pos.avance, '--relleno': relleno }}>
                <header className={styles.cabecera}>
                    <span className={`${styles.gema} ${styles.gemaGrande} ${styles[`metal_${pos.actual.clave}`]}`} aria-hidden="true">
                        <Trophy size={30} strokeWidth={2.25} />
                    </span>
                    <p className={styles.antetitulo}>{t('Tu rango')}</p>
                    <h2 id="escalera-rangos-titulo" className={styles.titulo}>{nombre(pos.actual.clave)}</h2>
                    <p className={styles.total}>
                        <Star size={15} className={styles.estrellaLlena} aria-hidden="true" />
                        {tn(pos.total, '{n} estrella en total', '{n} estrellas en total', { n: formatNumber(pos.total) })}
                    </p>

                    {pos.siguiente ? (
                        <div className={styles.progreso}>
                            <div className={styles.progresoTexto}>
                                <span>{nombre(pos.actual.clave)}</span>
                                <span className={styles.progresoFalta}>
                                    {tn(pos.faltan, 'Te falta {n} para {rango}', 'Te faltan {n} para {rango}',
                                        { n: pos.faltan, rango: nombre(pos.siguiente.clave) })}
                                </span>
                                <span>{nombre(pos.siguiente.clave)}</span>
                            </div>
                            <div
                                className={styles.barra}
                                role="progressbar"
                                aria-valuemin={pos.actual.desde}
                                aria-valuemax={pos.siguiente.desde}
                                aria-valuenow={pos.total}
                                aria-label={t('Avance hacia {rango}', { rango: nombre(pos.siguiente.clave) })}
                            >
                                <span className={`${styles.barraRelleno} ${styles[`metal_${pos.siguiente.clave}`]}`} />
                            </div>
                        </div>
                    ) : (
                        <p className={styles.cima}>{t('Estás en la cima: llegaste a Diamante.')}</p>
                    )}
                </header>

                {pos.siguiente && (
                    <div className={styles.camino}>
                        <div className={styles.caminoDato}>
                            <span className={styles.caminoNumero}>{camino.perfectas}</span>
                            <span className={styles.caminoTexto}>
                                {tn(camino.perfectas, 'semana perfecta', 'semanas perfectas', { n: camino.perfectas })}
                            </span>
                        </div>
                        <div className={styles.caminoDato}>
                            <span className={styles.caminoNumero}>{camino.aTuRitmo ?? '—'}</span>
                            <span className={styles.caminoTexto}>
                                {camino.aTuRitmo == null
                                    ? (semanasCerradas > 0
                                        // Semanas cerradas pero sin estrellas: no hay ritmo que proyectar; lo útil es la primera.
                                        ? t('con 3 días en meta en una semana ganas la primera')
                                        : t('cierra tu primera semana para ver tu ritmo'))
                                    : tn(camino.aTuRitmo, 'semana a tu ritmo', 'semanas a tu ritmo', { n: camino.aTuRitmo })}
                            </span>
                        </div>
                    </div>
                )}

                <ol className={styles.escalera} aria-label={t('Los rangos')}>
                    {[...ESCALERA].reverse().map((r) => {
                        const i = ESCALERA.indexOf(r);
                        const estado = i < pos.indice ? 'logrado' : i === pos.indice ? 'actual' : 'bloqueado';
                        return (
                            <li key={r.clave} className={`${styles.peldano} ${styles[estado]}`} aria-current={estado === 'actual' ? 'step' : undefined}>
                                <span className={`${styles.gema} ${styles[`metal_${r.clave}`]}`} aria-hidden="true">
                                    {estado === 'bloqueado' ? <Lock size={16} strokeWidth={2.5} /> : <Trophy size={17} strokeWidth={2.25} />}
                                </span>
                                <div className={styles.peldanoTexto}>
                                    <span className={styles.peldanoNombre}>{nombre(r.clave)}</span>
                                    <span className={styles.peldanoDesde}>
                                        {r.desde === 0
                                            ? t('Tu punto de partida')
                                            : tn(r.desde, 'Desde {n} estrella', 'Desde {n} estrellas', { n: r.desde })}
                                    </span>
                                </div>
                                <span className={styles.peldanoEstado}>
                                    {estado === 'logrado' && <><Check size={14} strokeWidth={3} aria-hidden="true" />{t('Conseguido')}</>}
                                    {estado === 'actual' && t('Estás aquí')}
                                    {estado === 'bloqueado' && tn(r.desde - pos.total, 'Faltan {n} ★', 'Faltan {n} ★', { n: r.desde - pos.total })}
                                </span>
                            </li>
                        );
                    })}
                </ol>

                <section className={styles.reglas} aria-labelledby="escalera-reglas">
                    <h3 id="escalera-reglas" className={styles.reglasTitulo}>{t('Cómo se ganan las estrellas')}</h3>
                    <p className={styles.reglasTexto}>{t('Cada semana, según los días que cierras dentro de tu meta:')}</p>
                    <ul className={styles.reglasLista}>
                        {[[3, 1], [5, 2], [7, 3]].map(([dias, n]) => (
                            <li key={dias} className={styles.regla}>
                                <span className={styles.reglaEstrellas} aria-hidden="true">
                                    {Array.from({ length: 3 }, (_, k) => (
                                        <Star key={k} size={14} className={k < n ? styles.estrellaLlena : styles.estrellaVacia} />
                                    ))}
                                </span>
                                <span>{tn(dias, '{n} día en meta', '{n} días en meta', { n: dias })}</span>
                            </li>
                        ))}
                    </ul>
                    <p className={styles.reglasNota}>{t('Las estrellas no se pierden: un día flojo solo deja de sumar.')}</p>
                </section>
            </div>
        </Modal>
    );
}

EscaleraDeRangos.propTypes = {
    abierta: PropTypes.bool.isRequired,
    onCerrar: PropTypes.func.isRequired,
    estrellas: PropTypes.number,
    semanasCerradas: PropTypes.number,
};

export default EscaleraDeRangos;
