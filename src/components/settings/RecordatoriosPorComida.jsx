// [P1-PLAN-LOTE-220 · 2026-09-24] Cada recordatorio de comida con su interruptor y su hora.
//
// El dueño, con el aviso del desayuno todavía en el chat a la 1:18 p. m.: «¿y qué tal si el usuario lo puede decidir?
// … no sería más flexible?». Su almuerzo sonaba hacia las 2:15 porque la hora salía de cuándo REGISTRABA, que es
// siempre después de comer. Ahora se elige aquí; sin tocar nada, las normales (8:45 / 12:45 / 15:45 / 19:15).
//
// Lo que se pinta lo dice el SERVIDOR (`GET /api/notifications/meal-reminders` → `comidas`): la misma cuenta con la que
// suenan el teléfono y el mensaje del coach, sin una tercera copia de las horas aquí. Se guarda con `PATCH /api/profile`
// la configuración ENTERA de las cuatro: el merge de `health_profile` es de primer nivel, así que mandar una sola comida
// borraría las otras tres. Y el formulario no la toca (`CLAVES_CON_CONTROL_PROPIO`).
import { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { toast } from 'sonner';
import { fetchWithAuth } from '../../config/api';
import { useT } from '../../i18n';
import { CLAVE_AVISOS_POR_COMIDA, aHHMM, configParaGuardar, leerHHMM } from '../../utils/recordatoriosPorComida';
import styles from './RecordatoriosPorComida.module.css';

// Función y no constante: una tabla de copy en ámbito de módulo se congela en español al importar (P1-I18N-DASHBOARD).
const getNombres = (t) => {
    return { desayuno: t('Desayuno'), almuerzo: t('Almuerzo'), merienda: t('Merienda'), cena: t('Cena') };
};

const RecordatoriosPorComida = ({ claseInterruptor, claseDeslizador, onGuardado = null }) => {
    const t = useT();
    const [comidas, setComidas] = useState(null);      // null = leyendo; [] = el servidor aún no las manda
    const [silencio, setSilencio] = useState(6);       // antes de esta hora no suena ningún aviso (servidor)
    const [tope, setTope] = useState(23);              // desde esta, solo el resumen del día: el chat no escribiría
    const [error, setError] = useState(false);
    const [intento, setIntento] = useState(0);
    const [borradores, setBorradores] = useState({});  // meal → «HH:MM» mientras se edita la hora

    useEffect(() => {
        let vivo = true;
        (async () => {
            try {
                const res = await fetchWithAuth('/api/notifications/meal-reminders');
                if (!res.ok) throw new Error(`GET /api/notifications/meal-reminders → HTTP ${res.status}`);
                const datos = await res.json();
                if (!vivo) return;
                const q = Number(datos?.quiet_until_hour);
                setSilencio(Number.isFinite(q) ? q : 6);
                const tp = Number(datos?.reminders_before_hour);
                setTope(Number.isFinite(tp) ? tp : 23);
                setComidas(Array.isArray(datos?.comidas) ? datos.comidas : []);
                setError(false);
            } catch {
                if (vivo) setError(true);
            }
        })();
        return () => { vivo = false; };
    }, [intento]);

    // Guardado en serie: si llega otro cambio mientras se guarda uno (mover la hora y tocar otro interruptor), el
    // bucle en curso manda el último estado en vez de pisarse con él. Deshabilitar los controles se comería ese toque.
    const guardandoRef = useRef(false);
    const deseadaRef = useRef(null);
    const guardar = useCallback(async (nuevas) => {
        setComidas(nuevas);
        deseadaRef.current = nuevas;
        if (guardandoRef.current) return;
        guardandoRef.current = true;
        let ok = true;
        try {
            while (deseadaRef.current) {
                const lote = deseadaRef.current;
                deseadaRef.current = null;
                const res = await fetchWithAuth('/api/profile', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ health_profile: { [CLAVE_AVISOS_POR_COMIDA]: configParaGuardar(lote) } }),
                });
                if (!res.ok) throw Object.assign(new Error(`PATCH /api/profile → HTTP ${res.status}`), { status: res.status });
            }
        } catch (err) {
            ok = false;
            deseadaRef.current = null;
            // `PATCH /api/profile` admite 10 por minuto: quien prueba varias horas seguidas puede toparlo, y «revisa tu
            // conexión» le mentiría.
            toast.error(err?.status === 429
                ? t('Demasiadas solicitudes seguidas. Espera un momento y reintenta.')
                : t('No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.'), { id: 'recordatorios-comida' });
            setIntento((n) => n + 1);   // vuelve a pintar lo que de verdad quedó guardado
        } finally {
            guardandoRef.current = false;
        }
        if (!ok) return;
        toast.success(t('Recordatorios guardados.'), { id: 'recordatorios-comida' });
        // El teléfono reprograma con lo que diga el servidor (en web no hace nada).
        try { await onGuardado?.(); } catch { /* el próximo arranque lo resincroniza */ }
    }, [onGuardado, t]);

    const cambiarInterruptor = (meal, activo) => {
        guardar(comidas.map((c) => (c.meal === meal ? { ...c, active: activo } : c)));
    };

    const soltarHora = (c) => {
        const borrador = borradores[c.meal];
        if (borrador === undefined) return;
        setBorradores((b) => {
            const { [c.meal]: _descartado, ...resto } = b;
            return resto;
        });
        const nueva = leerHHMM(borrador);
        if (!nueva || (nueva.hora === c.hour && nueva.minuto === c.minute)) return;
        // Solo horas en las que suenan el teléfono Y el mensaje del chat (el servidor rechaza las demás con un 400).
        if (nueva.hora < silencio || nueva.hora >= tope) {
            toast.error(t('Elige una hora entre las {desde} y las {hasta}.', { desde: `${silencio}:00`, hasta: `${tope - 1}:59` }),
                { id: 'recordatorios-comida' });
            return;
        }
        guardar(comidas.map((x) => (x.meal === c.meal ? { ...x, hour: nueva.hora, minute: nueva.minuto, chosen: true } : x)));
    };

    const restablecer = () => {
        guardar(comidas.map((c) => ({ ...c, hour: c.default_hour, minute: c.default_minute, chosen: false })));
    };

    if (error) {
        return (
            <div className={styles.nota} role="status">
                <span>{t('No pudimos cargar tus horas de aviso.')}</span>
                <button type="button" className={styles.enlace} onClick={() => setIntento((n) => n + 1)}>{t('Reintentar')}</button>
            </div>
        );
    }
    // Leyendo, o un servidor anterior al lote 220: no se pinta nada (el interruptor general de arriba sigue).
    if (!comidas || !comidas.length) return null;

    const nombres = getNombres(t);
    return (
        <div className={styles.lista} role="group" aria-label={t('Hora de cada recordatorio')}>
            {comidas.map((c) => {
                const nombre = nombres[c.meal] || c.meal;
                return (
                    <div key={c.meal} className={styles.fila} data-comida={c.meal}>
                        <span className={c.active ? styles.nombre : `${styles.nombre} ${styles.apagada}`}>{nombre}</span>
                        {/* Hora e interruptor van juntos: si el nombre no cabe al lado (320 px, «Petit-déjeuner»), bajan
                            los dos a la línea siguiente en vez de montarse encima del nombre. */}
                        <div className={styles.controles}>
                            <input
                                type="time"
                                className={styles.hora}
                                value={borradores[c.meal] ?? aHHMM(c.hour, c.minute)}
                                step={300}
                                min={aHHMM(silencio, 0)}
                                max={aHHMM(tope - 1, 59)}
                                disabled={!c.active}
                                aria-label={t('Hora del recordatorio: {comida}', { comida: nombre })}
                                onChange={(e) => setBorradores((b) => ({ ...b, [c.meal]: e.target.value }))}
                                onBlur={() => soltarHora(c)}
                            />
                            <label className={claseInterruptor}>
                                <input
                                    type="checkbox"
                                    checked={c.active}
                                    aria-label={t('Recordatorio: {comida}', { comida: nombre })}
                                    onChange={(e) => cambiarInterruptor(c.meal, e.target.checked)}
                                />
                                <span className={claseDeslizador} />
                            </label>
                        </div>
                    </div>
                );
            })}
            {comidas.some((c) => c.chosen) && (
                <button type="button" className={styles.enlace} onClick={restablecer}>
                    {t('Volver a las horas normales')}
                </button>
            )}
        </div>
    );
};

RecordatoriosPorComida.propTypes = {
    claseInterruptor: PropTypes.string,
    claseDeslizador: PropTypes.string,
    onGuardado: PropTypes.func,
};

export default RecordatoriosPorComida;
