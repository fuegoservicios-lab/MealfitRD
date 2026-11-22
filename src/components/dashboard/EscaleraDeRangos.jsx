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
// [P1-PLAN-LOTE-1161 · 2026-11-22] Juego 2.0: con `puntos` (servidor nuevo) la hoja enseña el rango CON DIVISIÓN
// (Plata II), los puntos totales, el camino a la siguiente división, la escalera de 5 rangos × 3 divisiones, cómo se
// ganan los puntos y la escalera de la racha (multiplicadores y escudos). Sin `puntos`, la hoja de estrellas de antes.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { Check, Flame, Lock, Shield, Star, Trophy, X } from 'lucide-react';
import { useModalAccessibility } from '../../hooks/useModalAccessibility';
import { useBottomSheet } from '../../hooks/useBottomSheet';
import { Button } from '../ui/Button';
import { formatNumber, useT, useTn } from '../../i18n';
import { ESCALERA, posicionEnLaEscalera, semanasHasta, semanasPorRitmo, RITMO_PROPIO_MAX_SEMANAS } from '../../utils/caminoDeRangos';   // [1157] [1158]
import {
    ESCUDOS_MAX, ESCUDO_CADA, PUNTOS, RANGOS_PUNTOS, TRAMOS_RACHA, escaleraDePuntos, nombreDelRango, nombreDelTramo,
    rangoPorPuntos, tramoDeRacha,
} from '../../utils/juegoPuntos';
import styles from './EscaleraDeRangos.module.css';

/** La hoja abierta: existe solo mientras se ve, así `useBottomSheet` recuerda y restaura el scroll del fondo. */
function HojaDeRangos({ onCerrar, estrellas, semanasCerradas, puntos = null, racha = 0, escudos = 0, aguaEncendida = false }) {
    const t = useT();
    const tn = useTn();
    const { containerRef } = useModalAccessibility({ isOpen: true, onClose: onCerrar });
    const bodyRef = useRef(null);
    const hoja = useBottomSheet({ containerRef, bodyRef, onClose: onCerrar });
    // [P1-PLAN-LOTE-1158] Firefox, ventana estrecha: la hoja toca el borde derecho y ahí Firefox entrega el puntero a
    // la barra de la PÁGINA (`elementFromPoint` → <html>), no a la de la hoja: arrastrar no bajaba la lista. Con la
    // raíz también bloqueada mientras la hoja está abierta, la barra del borde es la de la hoja.
    useEffect(() => {
        const raiz = document.documentElement;
        const antes = raiz.style.overflow;
        raiz.style.overflow = 'hidden';
        return () => { raiz.style.overflow = antes; };
    }, []);
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
    // [1161] modo puntos
    const conPuntos = Number.isFinite(Number(puntos)) && puntos !== null;
    const rp = conPuntos ? rangoPorPuntos(puntos) : null;
    const pelDePuntos = conPuntos ? escaleraDePuntos() : [];
    const indiceRango = conPuntos ? RANGOS_PUNTOS.findIndex(([c]) => c === rp.clave) : 0;
    const rellenoPts = conPuntos ? Math.min(1, (indiceRango + (rp.division - 1 + (rp.siguiente ? rp.avance : 1)) / 3) / (RANGOS_PUNTOS.length - 1)) : 0;
    const ptsTexto = (n) => t('{n} pts', { n: formatNumber(n) });
    const tramo = tramoDeRacha(racha);
    const nombresPuntos = {
        registro: t('Registrar lo que comes'), completo: t('Día completo (3 comidas o más)'),
        banda: t('Calorías dentro de tu meta'), proteina: t('Llegar a tu proteína'), agua: t('Tu agua del día'),
    };

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

                <div ref={bodyRef} className={styles.body} tabIndex={0} style={{ '--avance': conPuntos ? rp.avance : pos.avance, '--relleno': conPuntos ? rellenoPts : relleno }}>
                    {conPuntos ? (
                    <>
                    <div className={styles.columna}>
                        <header className={styles.cabecera}>
                            <span className={`${styles.gema} ${styles.gemaGrande} ${styles[`metal_${rp.clave}`]}`} aria-hidden="true">
                                <Trophy size={30} strokeWidth={2.25} />
                            </span>
                            <p className={styles.antetitulo}>{t('Tu rango')}</p>
                            <h2 id="escalera-rangos-titulo" className={styles.titulo}>{nombreDelRango(rp.clave, rp.division, t)}</h2>
                            <p className={styles.total}>{t('{n} pts en total', { n: formatNumber(puntos) })}</p>
                        </header>

                        {rp.siguiente ? (
                            <section className={styles.tarjeta} aria-labelledby="escalera-camino">
                                <h3 id="escalera-camino" className={styles.tarjetaTitulo}>
                                    <span className={`${styles.gema} ${styles.gemaMini} ${styles[`metal_${rp.siguiente.clave}`]}`} aria-hidden="true" />
                                    {t('Camino a {rango}', { rango: nombreDelRango(rp.siguiente.clave, rp.siguiente.division, t) })}
                                </h3>
                                <p className={styles.progresoFalta}>{t('Te faltan {n} pts', { n: formatNumber(rp.puntos_para_la_siguiente) })}</p>
                                <div
                                    className={styles.barra}
                                    role="progressbar"
                                    aria-valuemin={rp.desde}
                                    aria-valuemax={rp.hasta}
                                    aria-valuenow={puntos}
                                    aria-label={t('Avance hacia {rango}', { rango: nombreDelRango(rp.siguiente.clave, rp.siguiente.division, t) })}
                                >
                                    {rp.avance > 0 && <span className={`${styles.barraRelleno} ${styles[`metal_${rp.siguiente.clave}`]}`} />}
                                </div>
                                <div className={styles.extremos} aria-hidden="true">
                                    <span>{ptsTexto(rp.desde)}</span>
                                    <span>{ptsTexto(rp.hasta)}</span>
                                </div>
                            </section>
                        ) : (
                            <p className={styles.cima}>{t('Estás en la cima: llegaste a Diamante III.')}</p>
                        )}

                        <section className={styles.tarjeta} aria-labelledby="escalera-como">
                            <h3 id="escalera-como" className={styles.tarjetaTitulo}>{t('Cómo ganar puntos cada día')}</h3>
                            <ul className={styles.puntosLista}>
                                {Object.keys(PUNTOS).filter((k) => k !== 'agua' || aguaEncendida).map((k) => (
                                    <li key={k} className={styles.puntosFila}>
                                        <span>{nombresPuntos[k]}</span>
                                        <strong className={styles.puntosValor}>+{PUNTOS[k]}</strong>
                                    </li>
                                ))}
                            </ul>
                            <p className={styles.planNota}>{t('Los puntos no se pierden y nunca bajas de rango.')}</p>
                        </section>

                        <section className={styles.tarjeta} aria-labelledby="escalera-racha">
                            <h3 id="escalera-racha" className={styles.tarjetaTitulo}>
                                <Flame size={16} strokeWidth={2.5} className={styles.llamita} aria-hidden="true" />
                                {t('Tu racha multiplica los puntos')}
                            </h3>
                            <ol className={styles.tramos}>
                                {[...TRAMOS_RACHA].reverse().filter(([desde]) => desde > 0).map(([desde, mult, clave]) => (
                                    <li key={clave} className={`${styles.tramo} ${tramo.clave === clave ? styles.tramoActual : ''} ${racha >= desde ? styles.tramoLogrado : ''}`}>
                                        <span className={styles.tramoMult}>×{formatNumber(mult, { maximumFractionDigits: 2 })}</span>
                                        <span className={styles.tramoNombre}>{nombreDelTramo(clave, t)}</span>
                                        <span className={styles.tramoDias}>{tn(desde, 'desde {n} día', 'desde {n} días', { n: desde })}</span>
                                    </li>
                                ))}
                            </ol>
                            <p className={styles.planNota}>
                                {tramo.siguienteEn
                                    ? tn(tramo.siguienteEn - racha, '{n} día más registrando y ganas ×{m}.', '{n} días más registrando y ganas ×{m}.',
                                        { n: tramo.siguienteEn - racha, m: formatNumber(tramo.siguienteMult, { maximumFractionDigits: 2 }) })
                                    : t('Racha de leyenda: todo lo que ganas vale el doble.')}
                            </p>
                            <p className={styles.escudosNota}>
                                <span className={styles.escudosFila} aria-hidden="true">
                                    {Array.from({ length: ESCUDOS_MAX }, (_, i) => (
                                        <Shield key={i} size={15} strokeWidth={2.5} className={i < escudos ? styles.escudoLleno : styles.escudoVacio} />
                                    ))}
                                </span>
                                {t('Cada {n} días seguidos ganas un escudo (máximo {m}). Si un día no registras, el escudo salva tu racha.', { n: ESCUDO_CADA, m: ESCUDOS_MAX })}
                            </p>
                        </section>
                    </div>

                    <div className={styles.columna}>
                        <ol className={styles.escalera} aria-label={t('Los rangos')}>
                            {RANGOS_PUNTOS.map(([clave, desde], i) => {
                                const estado = i < indiceRango ? 'logrado' : i === indiceRango ? 'actual' : 'bloqueado';
                                const esSiguiente = i === indiceRango + 1;
                                const divs = pelDePuntos.filter((x) => x.clave === clave);
                                return (
                                    <li
                                        key={clave}
                                        className={`${styles.peldano} ${styles[estado]} ${esSiguiente ? styles.siguiente : ''}`}
                                        aria-current={estado === 'actual' ? 'step' : undefined}
                                    >
                                        <span className={`${styles.gema} ${styles[`metal_${clave}`]}`} aria-hidden="true">
                                            {estado === 'bloqueado' ? <Lock size={15} strokeWidth={2.5} /> : <Trophy size={17} strokeWidth={2.25} />}
                                        </span>
                                        <div className={styles.peldanoTexto}>
                                            <span className={styles.peldanoNombre}>{nombreDelRango(clave, null, t)}</span>
                                            <span className={styles.peldanoDesde}>
                                                {desde === 0 ? t('Tu punto de partida') : t('Desde {n} pts', { n: formatNumber(desde) })}
                                            </span>
                                            <span className={styles.divisiones} aria-label={t('Divisiones de {rango}', { rango: nombreDelRango(clave, null, t) })}>
                                                {divs.map((d) => {
                                                    const hecha = puntos >= d.desde;
                                                    const aqui = clave === rp.clave && d.division === rp.division;
                                                    return (
                                                        <span key={d.division} className={`${styles.division} ${hecha ? styles.divisionHecha : ''} ${aqui ? styles.divisionAqui : ''}`}>
                                                            {['I', 'II', 'III'][d.division - 1]}
                                                        </span>
                                                    );
                                                })}
                                            </span>
                                        </div>
                                        <span className={styles.peldanoEstado}>
                                            {estado === 'logrado' && <><Check size={14} strokeWidth={3} aria-hidden="true" />{t('Conseguido')}</>}
                                            {estado === 'actual' && t('Estás aquí')}
                                            {esSiguiente && t('Faltan {n} pts', { n: formatNumber(desde - puntos) })}
                                        </span>
                                    </li>
                                );
                            })}
                        </ol>
                    </div>
                    </>
                    ) : (
                    <>
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
                    </>
                    )}
                </div>

                <div className={styles.pie}>
                    <Button block onClick={onCerrar}>{t('Entendido')}</Button>
                </div>
            </div>
        </div>
    );
}

const PROPS_PUNTOS = {
    puntos: PropTypes.number,
    racha: PropTypes.number,
    escudos: PropTypes.number,
    aguaEncendida: PropTypes.bool,
};

HojaDeRangos.propTypes = {
    onCerrar: PropTypes.func.isRequired,
    estrellas: PropTypes.number,
    semanasCerradas: PropTypes.number,
    ...PROPS_PUNTOS,
};

export function EscaleraDeRangos({ abierta, onCerrar, ...resto }) {
    if (!abierta || typeof document === 'undefined') return null;
    return createPortal(<HojaDeRangos onCerrar={onCerrar} {...resto} />, document.body);
}

EscaleraDeRangos.propTypes = {
    abierta: PropTypes.bool.isRequired,
    onCerrar: PropTypes.func.isRequired,
    estrellas: PropTypes.number,
    semanasCerradas: PropTypes.number,
    ...PROPS_PUNTOS,
};

export default EscaleraDeRangos;
