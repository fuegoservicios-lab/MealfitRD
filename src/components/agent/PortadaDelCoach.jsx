/**
 * [P1-COACH-PORTADA · 2026-11-27] La portada del chat del día: lo que se ve mientras el hilo solo tiene el saludo.
 *
 * Antes el saludo era una burbuja suelta arriba a la izquierda y el resto de la pantalla quedaba vacío (el dueño: «el
 * diseño se ve raro, el coach puede aprovechar ese espacio»). Ahora, como en los chats abiertos (ChatGPT, Gemini,
 * Claude), el saludo es el titular, centrado, con TU DÍA en números (lo registrado frente a la meta) y debajo de la caja
 * de escribir las sugerencias del momento: las mismas de `atajosDelChat` (con tus cifras reales), en tarjetas.
 *
 * Dos piezas porque viven en sitios distintos del chat: el saludo dentro del hilo y las tarjetas dentro de la caja de
 * escribir (la caja NO se mueve de sitio en el árbol: moverla la remontaría y perdería foco, dictado y adjuntos).
 */
import PropTypes from 'prop-types';
import { Activity, Apple, Bell, Camera, Clock, Dumbbell, FileText, Flame, MessageSquare, Utensils } from 'lucide-react';
import BotAvatar from './BotAvatar';
import { formatNumber, useT } from '../../i18n';
import styles from './PortadaDelCoach.module.css';

/** «¡Buen día, angelo! Todavía sin registros hoy. ¿Con qué arrancas?» → titular + el resto. */
export function partirSaludo(texto) {
    const limpio = String(texto || '').replace(/\*\*/g, '').trim();
    const m = limpio.match(/^(.{2,80}?[!?.])\s+([\s\S]+)$/);
    if (!m) return { titulo: limpio, resto: '' };
    return { titulo: m[1].trim(), resto: m[2].trim() };
}

const ICONOS = {
    escanear: Camera,
    informe: FileText,
    desayuno: Utensils,
    almuerzo: Utensils,
    cena: Utensils,
    proteina: Dumbbell,
    grasa: Flame,
    'como-voy': Activity,
    'me-toca': Clock,
    ligero: Apple,
};

/** [P1-PLAN-LOTE-1174] el texto de un aviso, sin marcas de formato */
export function textoDeAviso(contenido) {
    return String(contenido || '').replace(/\*\*|__|`/g, '').replace(/^#+\s*/gm, '').trim();
}

export function PortadaSaludo({ saludo, metas = null, totales = null, comidas = null, compacto = false, avisos = [] }) {
    const t = useT();
    const { titulo, resto } = partirSaludo(saludo);
    // [P1-PLAN-LOTE-1174 · 2026-11-27] Los avisos del coach (la notificación del almuerzo) van DENTRO de la portada, como
    // tarjeta compacta: como burbuja de chat ocupaban media pantalla, empujaban el saludo fuera (móvil) o lo montaban sobre
    // la cabecera (PC). Solo los 2 últimos: uno de una franja ya pasada no aporta.
    const avisosVisibles = (Array.isArray(avisos) ? avisos : []).map((a) => textoDeAviso(a?.content)).filter(Boolean).slice(-2);
    const clases = [styles.saludo, compacto ? styles.compacto : '', avisosVisibles.length ? styles.conAvisos : '']
        .filter(Boolean).join(' ');
    const metaKcal = Number(metas?.calories) || 0;
    const metaProt = Number(metas?.protein) || 0;
    const kcal = Math.round(Number(totales?.calories) || 0);
    const prot = Math.round(Number(totales?.protein) || 0);
    const nComidas = Array.isArray(comidas) ? comidas.length : null;
    const conDia = metaKcal > 0 || metaProt > 0;
    return (
        <section className={clases} data-portada-coach="">
            <BotAvatar size={compacto ? 52 : 76} float className={styles.avatar} />
            <h2 className={styles.titulo}>{titulo}</h2>
            {resto && <p className={styles.resto}>{resto}</p>}
            {conDia && (
                <ul className={styles.dia} aria-label={t('Tu día hasta ahora')}>
                    {metaKcal > 0 && (
                        <li className={styles.diaPieza}>
                            <span className={styles.diaNombre}>{t('Calorías')}</span>
                            <span className={styles.diaCifra}>
                                {formatNumber(kcal)}<span className={styles.diaMeta}> / {formatNumber(metaKcal)} kcal</span>
                            </span>
                            <progress className={styles.diaBarra} max={metaKcal} value={Math.min(kcal, metaKcal)} aria-label={t('Calorías')} />
                        </li>
                    )}
                    {metaProt > 0 && (
                        <li className={styles.diaPieza}>
                            <span className={styles.diaNombre}>{t('Proteína')}</span>
                            <span className={styles.diaCifra}>
                                {formatNumber(prot)}<span className={styles.diaMeta}> / {formatNumber(metaProt)} g</span>
                            </span>
                            <progress className={styles.diaBarra} max={metaProt} value={Math.min(prot, metaProt)} aria-label={t('Proteína')} />
                        </li>
                    )}
                    {nComidas !== null && (
                        <li className={styles.diaPieza}>
                            <span className={styles.diaNombre}>{t('Comidas hoy')}</span>
                            <span className={styles.diaCifra}>{formatNumber(nComidas)}</span>
                        </li>
                    )}
                </ul>
            )}
            {avisosVisibles.length > 0 && (
                <ul className={styles.avisos} aria-label={t('Aviso del coach')}>
                    {avisosVisibles.map((texto, i) => (
                        <li key={i} className={styles.aviso}>
                            <span className={styles.avisoEtiqueta}>
                                <Bell size={13} strokeWidth={2.4} aria-hidden="true" /> {t('Aviso del coach')}
                            </span>
                            <p className={styles.avisoTexto}>{texto}</p>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

PortadaSaludo.propTypes = {
    saludo: PropTypes.string,
    metas: PropTypes.object,
    totales: PropTypes.object,
    comidas: PropTypes.array,
    compacto: PropTypes.bool,
    avisos: PropTypes.arrayOf(PropTypes.shape({ content: PropTypes.string })),
};

export function PortadaAtajos({ atajos = [], onAtajo, compacto = false }) {
    const t = useT();
    if (!atajos.length) return null;
    return (
        <div className={compacto ? `${styles.atajos} ${styles.atajosCompactos}` : styles.atajos}
            role="group" aria-label={t('Acciones rápidas')} data-n={atajos.length}>
            {atajos.map((a) => {
                const Icono = ICONOS[a.id] || MessageSquare;
                return (
                    <button key={a.id} type="button" className={styles.atajo} onClick={() => onAtajo?.(a)}>
                        <span className={styles.atajoIcono} aria-hidden="true"><Icono size={18} strokeWidth={2.2} /></span>
                        <span className={styles.atajoTexto}>{(compacto && a.corto) || a.texto}</span>
                    </button>
                );
            })}
        </div>
    );
}

PortadaAtajos.propTypes = {
    atajos: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.string, texto: PropTypes.string })),
    onAtajo: PropTypes.func,
    compacto: PropTypes.bool,
};
