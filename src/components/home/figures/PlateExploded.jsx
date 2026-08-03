import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import styles from './PlateExploded.module.css';

/* [P1-PAPER-HERO-FIG00 · 2026-08-01] Fig. 00 — DESPIECE DE UN PLATO DOMINICANO.
 *
 * Sustituye a la esfera en vídeo del hero (5.550.239 bytes de assets + dos
 * IntersectionObserver + reintento de reproducción en gesto) por ~2 KB de SVG
 * inline.
 *
 * QUÉ DIBUJA: abajo la elipse del plato en planta; encima, cinco componentes
 * separados sobre un eje vertical común, enhebrados por una guía punteada que
 * baja hasta el centro del plato (el eje de montaje del despiece). Cada
 * componente lleva su rótulo mono a la izquierda. A la derecha, dos cotas con
 * flechas: `2 000 kcal` sobre la pila entera y `140 g proteína` anidada sobre
 * el bloque de pollo.
 *
 * LA REGLA MORAL, Y ES VERIFICABLE: si no lo medimos, no lo acotamos — y nada
 * decorativo lleva cota jamás. Las dos únicas cotas del dibujo corresponden a
 * dos números reales del producto (objetivo calórico y gramos de proteína).
 * Si alguien añade una tercera línea de cota, debe traer su número detrás.
 *
 * CODIFICACIÓN (§5.5 del spec — memorizable, aplicada en las 7 superficies):
 *   sólido   = lo medido, el dato acotado  → POLLO GUISADO
 *   contorno = el otro, lo no acotado      → HABICHUELA GUISADA
 *   trama45° = material seccionado         → ARROZ BLANCO
 *   punteado = referencia, no es materia   → el eje de montaje
 *
 * DECISIONES QUE UN FUTURO EDITOR VA A CUESTIONAR:
 *
 * 1) `pathLength={1}` en cada trazo animado. Sin él, `stroke-dasharray` habría
 *    que medirlo por elemento: con un dasharray uniforme los trazos cortos
 *    (una flecha de 9px) terminan de dibujarse en el 2% de la animación y
 *    «aparecen» en vez de trazarse. Normalizar a 1 hace que los 40 trazos
 *    compartan la misma curva de tiempo.
 *
 * 2) `vector-effect="non-scaling-stroke"` va como ATRIBUTO, no como propiedad
 *    CSS. La propiedad CSS es reciente (Chrome 122+/Safari 17.4+); el atributo
 *    es SVG 1.1 y lo entiende todo. Es lo que mantiene el trazo en 1 px CSS
 *    reales cuando la figura se escala a 328 px en un móvil — sin él, a 360 px
 *    de ancho el dibujo se lee desvaído, que es el riesgo 4 del spec.
 *
 * 3) La guía es un EJE encadenado (componente → componente → plato), no cinco
 *    radios desde cada pieza al plato. Cinco radios desde una columna estrecha
 *    hasta una elipse ancha se cruzan entre sí y cruzan las propias piezas: a
 *    360 px es ruido. El eje encadenado es además LA convención del despiece
 *    (los cinco quedan unidos al plato por la misma guía punteada, rematada en
 *    círculo en cada junta y en el centro del plato).
 *
 * 4) Los rótulos son `<text>` SVG, así que escalan con la figura: su tamaño
 *    CSS real es `font-size × (ancho renderizado / ancho del viewBox)`. MEDIDO
 *    a 360 px con el viewBox en 378: 10,7 px, por debajo del piso de 11 px del
 *    sistema. Por eso el recorte móvil baja a 364 (y el hero afina su padding
 *    a 1rem): 328/364 = 0,90 → 13 × 0,90 = 11,7 px CSS. Subir la fuente en vez
 *    de estrechar el viewBox NO funciona: `HABICHUELA GUISADA` son 18 caracteres
 *    monoespaciados (~10,8 × font-size de ancho) contra los 146 unidades que
 *    hay a la izquierda del ancla en x=152 — a 14 unidades se sale del encuadre.
 *    El techo de esta composición es 13,5.
 *
 * NO borrar `_ORDER`/`--d` creyendo que es azúcar: es el stagger de 70 ms con
 * techo duro de 1,4 s (grupo 7 × 70 ms + 900 ms = 1.390 ms).
 */

/* `VE` lo lleva TODO lo que tiene stroke: 1 px CSS real a cualquier escala.
   Sin esto, en la franja 900-1200 px la figura renderiza a ~321-380 px sobre un
   viewBox de 420 y el trazo se adelgaza a 0,76-0,90 px — y lo hace SOLO en los
   elementos que no lo lleven, así que la guía punteada se afinaría mientras las
   piezas siguen en 1 px. Justo la línea que codifica «referencia, no materia»
   sería la que se desvanece al achicar la figura. */
const VE = { vectorEffect: 'non-scaling-stroke' };

/* `T` = `VE` + longitud normalizada, para lo que se TRAZA. `pathLength={1}`
   remapea la longitud del path a 1, así que los 27 trazos comparten curva de
   tiempo en vez de que los cortos (una punta de flecha) se dibujen en el 2 %.
                                                                            ⚠
   NO añadir `T` a las guías punteadas ni a nada con `stroke-dasharray` propio:
   bajo `pathLength=1` el `dasharray: 3 4` de `.guide` se interpreta en ese
   espacio normalizado, el primer trazo de 3 cubre un path que mide 1, y la
   guía se dibuja SÓLIDA. A las guías y a los nodos les toca `VE` a secas. */
const T = { ...VE, pathLength: 1 };

/* Eje vertical común del despiece. */
const AXIS = 236;

/* Rótulo → y de su centro. La línea de referencia que lo une a la pieza se
   dibuja DENTRO del grupo de cada pieza (así se traza con ella, no aparte) y
   muere en su borde izquierdo real menos 6 — por eso AGUACATE, más estrecho,
   la lleva más a la derecha. */
const PARTS = [
    { key: 'arroz', label: 'ARROZ BLANCO', y: 55 },
    { key: 'habichuela', label: 'HABICHUELA GUISADA', y: 118 },
    { key: 'pollo', label: 'POLLO GUISADO', y: 188 },
    { key: 'ensalada', label: 'ENSALADA VERDE', y: 256 },
    { key: 'aguacate', label: 'AGUACATE', y: 330 },
];

/* Orden de trazado. El índice ES el stagger: `--d = i * 70ms`. Ocho grupos
   como máximo: 7 * 70 + 900 = 1.390 ms, bajo el techo duro de 1,4 s. */
const _ORDER = ['plate', 'arroz', 'habichuela', 'pollo', 'ensalada', 'aguacate', 'guides', 'cotas'];
const delayOf = (group) => `${_ORDER.indexOf(group) * 70}ms`;

const MQ_NARROW = '(max-width: 767px)';

const PlateExploded = () => {
    const reduce = useReducedMotion();
    const svgRef = useRef(null);

    /* Bajo 768 px el viewBox se recorta a 364: la cota anidada de `140 g`
       (x ≈ 392-410) sale del encuadre Y deja de renderizarse. Dos cotas
       superpuestas a ese ancho se pisan — es la mitigación obligatoria del
       riesgo 4 del spec, no una preferencia. El 364 no es redondo: es el
       elemento más a la derecha que SÍ sobrevive (la línea de referencia de la
       cota total, x=352) más margen. Cada unidad que sobre aquí encoge los
       rótulos — ver la nota 4 de la cabecera. */
    const [narrow, setNarrow] = useState(() => {
        try {
            return typeof window !== 'undefined' && window.matchMedia(MQ_NARROW).matches;
        } catch {
            return false;
        }
    });

    useEffect(() => {
        let mql;
        try {
            mql = typeof window !== 'undefined' ? window.matchMedia(MQ_NARROW) : null;
        } catch {
            mql = null;
        }
        if (!mql || typeof mql.addEventListener !== 'function') return undefined;
        const onChange = (e) => setNarrow(e.matches);
        mql.addEventListener('change', onChange);
        return () => mql.removeEventListener('change', onChange);
    }, []);

    /* TRAZADO. `reduce` nace ya dibujado: el gate está en la DEFINICIÓN del
       estado, no en su consumo — con reduced-motion el IntersectionObserver
       ni siquiera se monta (defensa (a); la (b) es el bloque @media del .css).
       Fuera de reduced-motion el observer se arma tras el primer frame idle:
       en gama baja el trazado de la primera pantalla compite con el hidratado
       (riesgo (c) del §4.2). */
    const [drawn, setDrawn] = useState(false);

    useEffect(() => {
        if (reduce) {
            setDrawn(true);
            return undefined;
        }
        const el = svgRef.current;
        if (!el || typeof IntersectionObserver === 'undefined') {
            setDrawn(true);
            return undefined;
        }
        let io = null;
        let idleId = null;
        const arm = () => {
            io = new IntersectionObserver((entries) => {
                if (entries.some((e) => e.isIntersecting)) {
                    setDrawn(true);
                    if (io) io.disconnect();
                }
            }, { threshold: 0.35 });
            io.observe(el);
        };
        const rafId = requestAnimationFrame(() => {
            if (typeof window.requestIdleCallback === 'function') {
                idleId = window.requestIdleCallback(arm, { timeout: 400 });
            } else {
                idleId = window.setTimeout(arm, 0);
            }
        });
        return () => {
            cancelAnimationFrame(rafId);
            if (idleId !== null) {
                if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idleId);
                else window.clearTimeout(idleId);
            }
            if (io) io.disconnect();
        };
    }, [reduce]);

    const g = (group) => ({ style: { '--d': delayOf(group) } });

    return (
        <svg
            ref={svgRef}
            className={`${styles.fig00}${drawn ? ` ${styles.drawn}` : ''}`}
            viewBox={narrow ? '0 0 364 480' : '0 0 420 480'}
            role="presentation"
            aria-hidden="true"
            focusable="false"
        >
            <defs>
                {/* Trama de material seccionado. `patternUnits="userSpaceOnUse"`
                    es OBLIGATORIO, y no por lo que suele decirse: no impide que
                    el tile escale con el viewBox (escala todo el SVG, el tile
                    incluido). Lo que evita es el DEFAULT, `objectBoundingBox`,
                    donde width/height son fracciones del bbox de la forma que
                    referencia el patrón. El bbox de este cuerpo de cilindro es
                    88×40, así que un tile en fracciones saldría ANISÓTROPO: el
                    paso horizontal y el vertical dejan de ser iguales, la trama
                    deja de estar a 45° reales y cada forma que use el patrón la
                    dibuja con una separación distinta. En `userSpaceOnUse` el
                    tile son 5×5 unidades de usuario, isótropo e idéntico en
                    todas las formas — y una separación predecible es lo que
                    evita que a DPR fraccionario los pasos sub-píxel batan en
                    moiré. */}
                <pattern
                    id="paFig00Hatch"
                    patternUnits="userSpaceOnUse"
                    width="5"
                    height="5"
                    patternTransform="rotate(45)"
                >
                    <line className={styles.hatchLine} x1="0" y1="0" x2="0" y2="5" vectorEffect="non-scaling-stroke" />
                </pattern>
            </defs>

            {/* ── PLATO EN PLANTA ──────────────────────────────────────────── */}
            <g {...g('plate')}>
                <ellipse className={styles.stroke} cx={AXIS} cy="424" rx="96" ry="28" {...T} />
                <ellipse className={styles.stroke} cx={AXIS} cy="424" rx="76" ry="21" {...T} />
            </g>

            {/* ── 1 · ARROZ BLANCO — cilindro con interior tramado a 45° ────── */}
            <g {...g('arroz')}>
                {/* Cuerpo seccionado: limitado arriba por la mitad FRONTAL de la
                    elipse superior (la trasera es el hueco del cilindro, no
                    material) y abajo por el arco frontal de la base. */}
                <path
                    className={styles.hatchFill}
                    d="M192,40 A44,10 0 0 0 280,40 L280,70 A44,10 0 0 1 192,70 Z"
                />
                <ellipse className={styles.stroke} cx={AXIS} cy="40" rx="44" ry="10" {...T} />
                <line className={styles.stroke} x1="192" y1="40" x2="192" y2="70" {...T} />
                <line className={styles.stroke} x1="280" y1="40" x2="280" y2="70" {...T} />
                <path className={styles.stroke} d="M192,70 A44,10 0 0 0 280,70" {...T} />
                <line className={styles.stroke} x1="158" y1="55" x2="186" y2="55" {...T} />
            </g>

            {/* ── 2 · HABICHUELA GUISADA — bloque en CONTORNO ───────────────── */}
            <g {...g('habichuela')}>
                <rect className={styles.stroke} x="192" y="106" width="88" height="36" {...T} />
                <path className={styles.stroke} d="M192,106 L208,94 L296,94 L280,106" {...T} />
                <path className={styles.stroke} d="M280,106 L296,94 L296,130 L280,142" {...T} />
                <line className={styles.stroke} x1="158" y1="118" x2="186" y2="118" {...T} />
            </g>

            {/* ── 3 · POLLO GUISADO — bloque SÓLIDO (es la proteína: es el dato
                   que se acota, y por eso es el único relleno de tinta) ─────── */}
            <g {...g('pollo')}>
                <path
                    className={styles.solidFill}
                    d="M192,176 L208,164 L296,164 L296,200 L280,212 L192,212 Z"
                />
                <path
                    className={styles.stroke}
                    d="M192,176 L208,164 L296,164 L296,200 L280,212 L192,212 Z"
                    {...T}
                />
                {/* Aristas internas en papel: sin ellas el bloque sólido colapsa
                    a una silueta plana y pierde el volumen. */}
                <path className={`${styles.stroke} ${styles.edgeLight}`} d="M192,176 L280,176 L280,212" {...T} />
                <line className={`${styles.stroke} ${styles.edgeLight}`} x1="280" y1="176" x2="296" y2="164" {...T} />
                <line className={styles.stroke} x1="158" y1="188" x2="186" y2="188" {...T} />
            </g>

            {/* ── 4 · ENSALADA VERDE — pila de tres elipses finas ───────────── */}
            <g {...g('ensalada')}>
                <ellipse className={styles.stroke} cx={AXIS} cy="244" rx="42" ry="6" {...T} />
                <ellipse className={styles.stroke} cx={AXIS} cy="256" rx="42" ry="6" {...T} />
                <ellipse className={styles.stroke} cx={AXIS} cy="268" rx="42" ry="6" {...T} />
                <line className={styles.stroke} x1="158" y1="256" x2="188" y2="256" {...T} />
            </g>

            {/* ── 5 · AGUACATE — media luna ─────────────────────────────────── */}
            <g {...g('aguacate')}>
                <path className={styles.stroke} d="M250,300 A30,30 0 0 0 250,360 A42,42 0 0 1 250,300 Z" {...T} />
                <line className={styles.stroke} x1="158" y1="330" x2="214" y2="330" {...T} />
            </g>

            {/* ── EJE DE MONTAJE — guía punteada, rematada en círculo ────────
                   Punteado = referencia que no es materia (§5.5). Los cinco
                   componentes quedan unidos al plato por esta misma guía; el
                   círculo final se apoya en el centro de la elipse. */}
            <g {...g('guides')}>
                <line className={styles.guide} x1={AXIS} y1="80" x2={AXIS} y2="94" {...VE} />
                <line className={styles.guide} x1={AXIS} y1="142" x2={AXIS} y2="164" {...VE} />
                <line className={styles.guide} x1={AXIS} y1="212" x2={AXIS} y2="238" {...VE} />
                <line className={styles.guide} x1={AXIS} y1="274" x2={AXIS} y2="300" {...VE} />
                <line className={styles.guide} x1={AXIS} y1="360" x2={AXIS} y2="424" {...VE} />
                <circle className={styles.node} cx={AXIS} cy="94" r="2" {...VE} />
                <circle className={styles.node} cx={AXIS} cy="164" r="2" {...VE} />
                <circle className={styles.node} cx={AXIS} cy="238" r="2" {...VE} />
                <circle className={styles.node} cx={AXIS} cy="300" r="2" {...VE} />
                <circle className={styles.node} cx={AXIS} cy="424" r="2" {...VE} />
            </g>

            {/* ── COTAS ─────────────────────────────────────────────────────── */}
            <g {...g('cotas')}>
                {/* Cota total: abarca la pila entera (arroz .. aguacate). */}
                <line className={styles.stroke} x1="302" y1="30" x2="352" y2="30" {...T} />
                <line className={styles.stroke} x1="302" y1="360" x2="352" y2="360" {...T} />
                <line className={styles.stroke} x1="346" y1="30" x2="346" y2="360" {...T} />
                <path className={styles.arrow} d="M346,30 L343,39 L349,39 Z" />
                <path className={styles.arrow} d="M346,360 L343,351 L349,351 Z" />
                {/* Girado -90°: es como se rotula una cota vertical, y además
                    ahorra los ~80 px de ancho que no tenemos. Desplazado hacia
                    arriba (y=108, no el centro 195) para no chocar con las
                    líneas de referencia de la cota anidada, que cruzan a
                    y=164 e y=212. */}
                <text className={styles.value} x="338" y="108" textAnchor="middle" transform="rotate(-90 338 108)">
                    2 000 kcal
                </text>

                {/* Cota anidada sobre el bloque de pollo. Fuera del encuadre
                    bajo 768 px — ver el comentario de `narrow`. */}
                {!narrow && (
                    <>
                        <line className={styles.stroke} x1="302" y1="164" x2="398" y2="164" {...T} />
                        <line className={styles.stroke} x1="302" y1="212" x2="398" y2="212" {...T} />
                        <line className={styles.stroke} x1="392" y1="164" x2="392" y2="212" {...T} />
                        <path className={styles.arrow} d="M392,164 L389,173 L395,173 Z" />
                        <path className={styles.arrow} d="M392,212 L389,203 L395,203 Z" />
                        <text className={styles.value} x="404" y="188" textAnchor="middle" transform="rotate(-90 404 188)">
                            140 g proteína
                        </text>
                    </>
                )}
            </g>

            {/* ── RÓTULOS ───────────────────────────────────────────────────── */}
            {PARTS.map((p) => (
                <text
                    key={p.key}
                    className={styles.label}
                    style={{ '--d': delayOf(p.key) }}
                    x="152"
                    y={p.y}
                    textAnchor="end"
                    dominantBaseline="middle"
                >
                    {p.label}
                </text>
            ))}
        </svg>
    );
};

export default PlateExploded;
