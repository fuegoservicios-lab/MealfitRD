// [P1-PLAN-LOTE-1068 · 2026-11-17] La escalera de rangos (petición del dueño): al tocar la insignia se ven los cinco
// rangos, cuántas estrellas pide cada uno y cómo llegar al siguiente. Mecánica: las estrellas son por semana
// (3 / 5 / 7 días en meta → 1 / 2 / 3), así que el camino se cuenta en SEMANAS: con semanas perfectas y a tu ritmo.
// Los umbrales son los del servidor (`progreso_semanas.RANGOS`); un test vigila que no se separen.
//
// [P1-PLAN-LOTE-1081 · 2026-11-18] El dueño, con la captura del iPhone: «se ve medio raro» y «quiero que se pueda salir
// de manera más cómoda, no solo con la X». Era un `Modal` común con la hoja desplazándose DENTRO del panel arrastrable
// (el arrastre de framer y el scroll se peleaban: deslizar no cerraba), y Bronce —donde empieza todo el mundo— quedaba
// al fondo, cortado por el fundido. Ahora:
//  · hoja propia como la ficha de comida (portal, `useModalAccessibility`, `useBottomSheet`): se cierra deslizando hacia
//    abajo (desde el asa o con el cuerpo arriba del todo), tocando fuera, con Escape, con la X o con «Entendido»;
//  · la escalera va de Bronce (arriba) a Diamante: tu rango se ve sin desplazar;
//  · «Faltan N ★» solo en el SIGUIENTE rango (en los cinco se repetía); los lejanos dicen desde cuántas estrellas;
//  · el camino es una tarjeta «Camino a Plata» con dos renglones, sin el «—» suelto cuando aún no hay ritmo;
//  · la barra vacía ya no pinta un punto gris, y debajo lleva sus extremos en estrellas.
// [P1-PLAN-LOTE-1157 · 2026-11-21] El dueño: «mejora esto en general; en PC no se puede scrollear para abajo».
//  · en PC la hoja no cabía (en un portátil de 768 px quedaba media escalera fuera) y el cuerpo escondía su barra de
//    desplazamiento: sin rueda no había forma de bajar, y nada decía que había más. Ahora, en pantallas anchas, DOS
//    columnas (tu rango y el camino | la escalera) que caben sin desplazar; barra fina visible con ratón, y un fundido
//    sobre el pie mientras queda algo debajo;
//  · «3 semanas perfectas / 81 semanas a tu ritmo» se leía como un dato tuyo y desanimaba (1 estrella en 9 semanas
//    cerradas da 81). El camino es ahora un plan con los TRES ritmos que dan estrellas (7, 5 y 3 días en meta → cuántas
//    semanas cada uno); «a tu ritmo» solo si es una cifra razonable (≤ 52 semanas). Las reglas de las estrellas quedan
//    dentro de ese plan (eran una tarjeta aparte que repetía lo mismo); en la cima siguen solas.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { Check, Lock, Star, Trophy, X } from 'lucide-react';
import { useModalAccessibility } from '../../hooks/useModalAccessibility';
import { useBottomSheet } from '../../hooks/useBottomSheet';
import { Button } from '../ui/Button';
import { formatNumber, useT, useTn } from '../../i18n';
import { ESCALERA, posicionEnLaEscalera, semanasHasta, semanasPorRitmo, RITMO_PROPIO_MAX_SEMANAS } from '../../utils/caminoDeRangos';   // [1157] [1158]
import styles from './EscaleraDeRangos.module.css';

/** La hoja abierta: existe solo mientras se ve, así `useBottomSheet` recuerda y restaura el scroll del fondo. */
function HojaDeRangos({ onCerrar, estrellas, semanasCerradas }) {
    const t = useT();
    const tn = useTn();
    const { containerRef } = useModalAccessibility({ isOpen: true, onClose: onCerrar });
    const bodyRef = useRef(null);
    const hoja = useBottomSheet({ containerRef, bodyRef, onClose: onCerrar });
    // [1157] ¿queda contenido debajo? (fundido sobre el pie: se ve que la hoja sigue)
    const [masAbajo, setMasAbajo] = useState(false);
    useEffect(() => {
        const el = bodyRef.current;
        if (!el) return undefined;
        const medir = () => setMasAbajo(el.scrollTop + el.clientHeight < el.scrollHeight - 8);
        const id = requestAnimationFrame(medir);
        el.addEventListener('scroll', medir, { passive: true });
        const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null;
        ro?.observe(el);
        return () => { cancelAnimationFrame(id); el.removeEventListener('scroll', medir); ro?.disconnect(); };
    }, []);

    const nombre = (clave) => ({
        bronce: t('Bronce'), plata: t('Plata'), oro: t('Oro'), platino: t('Platino'), diamante: t('Diamante'),
    })[clave] || '';
    const pos = posicionEnLaEscalera(estrellas);
    const camino = semanasHasta(pos.faltan, { estrellas: pos.total, semanasCerradas });
    const ritmos = semanasPorRitmo(pos.faltan);
    // Relleno del raíl: tramos completos + lo avanzado en el actual, contado desde arriba (Bronce).
    const tramos = ESCALERA.length - 1;
    const relleno = Math.min(1, (pos.indice + (pos.siguiente ? pos.avance : 0)) / tramos);
    const estrellasTexto = (n) => `${formatNumber(n)} ★`;

    return (
        <div className={styles.overlay}>
            <button type="button" className={styles.fondo} aria-hidden="true" tabIndex={-1} onClick={onCerrar} />
            <div
                ref={containerRef}
                className={styles.sheet}
                data-mas={masAbajo ? 'si' : undefined}
                role="dialog"
                aria-modal="true"
                aria-labelledby="escalera-rangos-titulo"
                tabIndex={-1}
                onTouchStart={hoja.onTouchStart}
                onTouchMove={hoja.onTouchMove}
                onTouchEnd={hoja.onTouchEnd}
                onTouchCancel={hoja.onTouchEnd}
            >
                <div className={styles.asa}>
                    <span className={styles.grip} aria-hidden="true" />
                    <button type="button" className={`${styles.cerrar} ui-close`} onClick={onCerrar} aria-label={t('Cerrar')}>
                        <X size={20} strokeWidth={2.25} aria-hidden="true" />
                    </button>
                </div>

                <div ref={bodyRef} className={styles.body} tabIndex={0} style={{ '--avance': pos.avance, '--relleno': relleno }}>
                    <div className={styles.columna}>
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
                    </header>

                    {pos.siguiente ? (
                        <section className={styles.tarjeta} aria-labelledby="escalera-camino">
                            <h3 id="escalera-camino" className={styles.tarjetaTitulo}>
                                <span className={`${styles.gema} ${styles.gemaMini} ${styles[`metal_${pos.siguiente.clave}`]}`} aria-hidden="true" />
                                {t('Camino a {rango}', { rango: nombre(pos.siguiente.clave) })}
                            </h3>
                            <p className={styles.progresoFalta}>
                                {tn(pos.faltan, 'Te falta {n} para {rango}', 'Te faltan {n} para {rango}',
                                    { n: pos.faltan, rango: nombre(pos.siguiente.clave) })}
                            </p>
                            <div
                                className={styles.barra}
                                role="progressbar"
                                aria-valuemin={pos.actual.desde}
                                aria-valuemax={pos.siguiente.desde}
                                aria-valuenow={pos.total}
                                aria-label={t('Avance hacia {rango}', { rango: nombre(pos.siguiente.clave) })}
                            >
                                {pos.avance > 0 && <span className={`${styles.barraRelleno} ${styles[`metal_${pos.siguiente.clave}`]}`} />}
                            </div>
                            <div className={styles.extremos} aria-hidden="true">
                                <span>{estrellasTexto(pos.actual.desde)}</span>
                                <span>{estrellasTexto(pos.siguiente.desde)}</span>
                            </div>

                            <h4 className={styles.planTitulo}>{t('Cómo llegar')}</h4>
                            <ul className={styles.plan}>
                                {ritmos.map((r) => (
                                    <li key={r.dias} className={styles.planFila}>
                                        <span className={styles.reglaEstrellas} aria-hidden="true">
                                            {Array.from({ length: 3 }, (_, k) => (
                                                <Star key={k} size={14} className={k < r.estrellas ? styles.estrellaLlena : styles.estrellaVacia} />
                                            ))}
                                        </span>
                                        <span className={styles.planDias}>{tn(r.dias, '{n} día en meta por semana', '{n} días en meta por semana', { n: r.dias })}</span>
                                        <strong className={styles.planSemanas}>{tn(r.semanas, 'en {n} semana', 'en {n} semanas', { n: r.semanas })}</strong>
                                    </li>
                                ))}
                            </ul>
                            <p className={styles.planNota}>
                                {camino.aTuRitmo != null && camino.aTuRitmo <= RITMO_PROPIO_MAX_SEMANAS
                                    ? tn(camino.aTuRitmo, 'A tu ritmo de ahora: unas {n} semana.', 'A tu ritmo de ahora: unas {n} semanas.', { n: camino.aTuRitmo })
                                    : camino.aTuRitmo == null && semanasCerradas === 0
                                        ? t('cierra tu primera semana para ver tu ritmo')
                                        : camino.aTuRitmo == null
                                            // Semanas cerradas pero sin estrellas: no hay ritmo que proyectar; lo útil es la primera.
                                            ? t('con 3 días en meta en una semana ganas la primera')
                                            : t('Las estrellas no se pierden: un día flojo solo deja de sumar.')}
                            </p>
                        </section>
                    ) : (
                        <p className={styles.cima}>{t('Estás en la cima: llegaste a Diamante.')}</p>
                    )}
                    </div>

                    <div className={styles.columna}>

                    <ol className={styles.escalera} aria-label={t('Los rangos')}>
                        {ESCALERA.map((r, i) => {
                            const estado = i < pos.indice ? 'logrado' : i === pos.indice ? 'actual' : 'bloqueado';
                            const esSiguiente = i === pos.indice + 1;
                            return (
                                <li
                                    key={r.clave}
                                    className={`${styles.peldano} ${styles[estado]} ${esSiguiente ? styles.siguiente : ''}`}
                                    aria-current={estado === 'actual' ? 'step' : undefined}
                                >
                                    <span className={`${styles.gema} ${styles[`metal_${r.clave}`]}`} aria-hidden="true">
                                        {estado === 'bloqueado' ? <Lock size={15} strokeWidth={2.5} /> : <Trophy size={17} strokeWidth={2.25} />}
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
                                        {esSiguiente && tn(r.desde - pos.total, 'Faltan {n} ★', 'Faltan {n} ★', { n: r.desde - pos.total })}
                                    </span>
                                </li>
                            );
                        })}
                    </ol>

                    {/* [1157] con un rango por delante, las reglas ya van en «Cómo llegar»; en la cima, aquí */}
                    {!pos.siguiente && (
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
                    )}
                    </div>
                </div>

                <div className={styles.pie}>
                    <Button block onClick={onCerrar}>{t('Entendido')}</Button>
                </div>
            </div>
        </div>
    );
}

HojaDeRangos.propTypes = {
    onCerrar: PropTypes.func.isRequired,
    estrellas: PropTypes.number,
    semanasCerradas: PropTypes.number,
};

export function EscaleraDeRangos({ abierta, onCerrar, estrellas, semanasCerradas }) {
    if (!abierta || typeof document === 'undefined') return null;
    return createPortal(
        <HojaDeRangos onCerrar={onCerrar} estrellas={estrellas} semanasCerradas={semanasCerradas} />,
        document.body,
    );
}

EscaleraDeRangos.propTypes = {
    abierta: PropTypes.bool.isRequired,
    onCerrar: PropTypes.func.isRequired,
    estrellas: PropTypes.number,
    semanasCerradas: PropTypes.number,
};

export default EscaleraDeRangos;
