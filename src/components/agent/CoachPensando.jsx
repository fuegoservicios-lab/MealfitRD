import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import BotAvatar from './BotAvatar';
import { useT } from '../../i18n';

/**
 * [COACH-EMBLEMA · 2026-11-13] Lo que se ve mientras el coach trabaja.
 *
 * Antes: un robot que miraba a los lados, tres puntitos saltando y frases rotativas inventadas («Alineando tu genética
 * con el plan…», «Calculando la mejor respuesta metabólica…»). El coach no alinea genética: era relleno, y junto a
 * cifras de salud restaba seriedad.
 *
 * Ahora la fila dice solo cosas ciertas:
 *   - `status` (lo que el servidor reporta de verdad: «Anotando lo que comiste…», «Analizando tus fotos…») manda.
 *   - sin `status`, una frase por TIEMPO transcurrido, no un carrusel: leer → pensar → «sigo en ello» → «tarda más de
 *     lo normal». Nunca afirma un paso que no conoce.
 *   - los pasos reales ya cumplidos quedan debajo con su visto, y a partir de 5 s aparece el reloj: la espera se mide,
 *     no se disimula.
 */
const SIN_PUNTOS = /[.…\s]+$/u;

function fraseSegunElTiempo(seg, t) {
    if (seg < 3) return t('Leyendo tu mensaje…');
    if (seg < 10) return t('Pensando la respuesta…');
    if (seg < 25) return t('Sigo en ello…');
    return t('Está tardando más de lo normal…');
}

export default function CoachPensando({ status, style }) {
    const t = useT();
    const [seg, setSeg] = useState(0);
    const [hechos, setHechos] = useState([]);
    const previo = useRef(null);

    useEffect(() => {
        const inicio = Date.now();
        const id = setInterval(() => setSeg(Math.floor((Date.now() - inicio) / 1000)), 1000);
        return () => clearInterval(id);
    }, []);

    // Un paso REAL que termina (el servidor cambió de estado) pasa a la lista de cumplidos. Las frases por tiempo no:
    // no son pasos, y marcarlas con un visto sería afirmar algo que no sabemos.
    useEffect(() => {
        const anterior = previo.current;
        previo.current = status || null;
        if (anterior && anterior !== status) {
            const limpio = anterior.replace(SIN_PUNTOS, '');
            setHechos((h) => (h.includes(limpio) ? h : [...h, limpio].slice(-2)));
        }
    }, [status]);

    const frase = status || fraseSegunElTiempo(seg, t);

    return (
        <div className="coach-pensando" style={style}>
            <BotAvatar size={34} thinking style={{ flexShrink: 0 }} />
            <div className="coach-pensando-cuerpo">
                <div className="coach-pensando-linea">
                    <span key={frase} className="coach-pensando-frase">{frase}</span>
                    {seg >= 5 && <span className="coach-pensando-reloj">{t('{n} s', { n: seg })}</span>}
                </div>
                {hechos.length > 0 && (
                    <div className="coach-pensando-hechos">
                        {hechos.map((h) => (
                            <span key={h} className="coach-pensando-hecho"><Check size={12} strokeWidth={2.6} aria-hidden="true" />{h}</span>
                        ))}
                    </div>
                )}
            </div>
            <style>{`
                .coach-pensando { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0; min-width: 0; }
                .coach-pensando-cuerpo { display: flex; flex-direction: column; gap: 0.2rem; min-width: 0; }
                .coach-pensando-linea { display: flex; align-items: baseline; gap: 0.55rem; min-width: 0; }
                .coach-pensando-frase {
                    font-size: 0.95rem; font-weight: 500; letter-spacing: -0.005em;
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;
                    color: transparent;
                    background: linear-gradient(100deg,
                        var(--text-muted) 0%, var(--text-muted) 38%,
                        var(--text-main) 50%,
                        var(--text-muted) 62%, var(--text-muted) 100%);
                    background-size: 240% 100%;
                    -webkit-background-clip: text; background-clip: text;
                    animation: coachFraseEntra .35s ease-out both, coachFraseBarrido 2.4s linear infinite;
                }
                .coach-pensando-reloj {
                    flex: none; font-size: 0.78rem; font-weight: 500; font-variant-numeric: tabular-nums;
                    color: var(--text-muted); opacity: .75;
                    animation: coachFraseEntra .4s ease-out both;
                }
                .coach-pensando-hechos { display: flex; flex-wrap: wrap; gap: 0.15rem 0.8rem; }
                .coach-pensando-hecho {
                    display: inline-flex; align-items: center; gap: 0.3rem;
                    font-size: 0.78rem; color: var(--text-muted); opacity: .8;
                    animation: coachFraseEntra .35s ease-out both;
                }
                .coach-pensando-hecho svg { color: var(--secondary, #10B981); flex: none; }
                @keyframes coachFraseEntra { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }
                @keyframes coachFraseBarrido { from { background-position: 120% 0; } to { background-position: -120% 0; } }
                @media (prefers-reduced-motion: reduce) {
                    .coach-pensando-frase { animation: none; color: var(--text-muted); background: none; }
                    .coach-pensando-reloj, .coach-pensando-hecho { animation: none; }
                }
            `}</style>
        </div>
    );
}
