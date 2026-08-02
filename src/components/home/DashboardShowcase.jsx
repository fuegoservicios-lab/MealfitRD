import { Link } from 'react-router-dom';
import PropTypes from 'prop-types';
import { motion, useReducedMotion } from 'framer-motion';
import {
    Clock, Flame, FileDown, Search, Plus, Sparkles, Send, AlertTriangle,
} from 'lucide-react';
import SeeMoreLink from './SeeMoreLink';
import { makeSectionMotion } from './sectionMotion';
import styles from './DashboardShowcase.module.css';

/* ============================================================================
   [P2-PAPER-NO-INK · 2026-08-01] DashboardShowcase → «03 / LAS PANTALLAS»,
   LÁMINA DE DESPIECE.

   Las cinco superficies de la app dejan de turnarse en un carrusel y pasan a
   estar las cinco a la vez sobre la misma hoja, como vistas ortográficas.
   Reparto DELIBERADAMENTE asimétrico sobre 12 columnas — 01 a 7 columnas y
   más alta, 02 y 03 a 5, 04 y 05 a 6 — porque una lámina real tiene una vista
   general grande y detalles pequeños; cinco celdas iguales es lo que la haría
   parecer una plantilla.

   MURIÓ EL COVERFLOW 3D ENTERO (`P3-DASHBOARD-3D`, 2026-06-29): `perspective`,
   `transform-style: preserve-3d`, los `rotateY`/`translateZ` con sus offsets
   por breakpoint, las flechas prev/next, las pills tablist con su
   `handleKeyDown`, el panel `activeInfo` con su `AnimatePresence`, los estados
   `active`/`paused` y el temporizador `RHYTHM` (`P3-DASHBOARD-RHYTHM`,
   2026-06-30) con su `setTimeout` recursivo de ráfagas y cooldown. Con ellos
   se fueron los 5 acentos de color, que NO vivían en el CSS: vivían aquí, en
   el array `FEATURES`, como `color: '#6366F1' | '#A78BFA' | '#34D399' |
   '#FB923C' | '#38BDF8'`, inyectados a la tarjeta y a la pill como
   `style={{'--accent': f.color}}` y al `<h3>` como `style={{color}}`. Un pase
   solo-CSS no habría tocado ni uno.

   Y MURIÓ `filter: brightness(calc(1 - var(--abs) * 0.12))`, que sobre papel
   hace LO CONTRARIO que sobre fondo oscuro. Oscurecer una tarjeta la hunde
   cuando el fondo es negro; sobre una hoja blanca la SACA al frente. Medido
   para `|offset| = 2`: 1,006:1 de contraste contra su fondo hoy → 1,720:1
   sobre papel, es decir, las tarjetas periféricas —las que el efecto existía
   para apagar— habrían sido los objetos de más contraste de la sección. Su
   compañero, el `drop-shadow(0 30px 52px …)` de la tarjeta activa, pasaba de
   casi invisible a manchón gris. Los dos borrados, no adaptados.

   EL ESTADO SE RECODIFICA POR FORMA, NUNCA POR TINTA:
     chips de color        → etiqueta mono con contorno de 1px
     barras de progreso    → pista de 1px + relleno sólido + % en mono tabular
     badges                → valor mono, sin caja
     avatar del chat       → cuadrado sólido con iniciales en mono
     iconos lucide         → strokeWidth 1.25, currentColor
     check verde/círculo   → CUADRADO RELLENO vs CUADRADO VACÍO, con la
                             leyenda impresa dentro del propio mockup

   `styles.shopItemPending` renderizaba `class="undefined"`: el JSX lo usaba y
   la regla no existía en el módulo. Inocuo, pero es exactamente el gancho que
   «por comprar» necesita para el contorno — cableado, no borrado. Su gemela
   `.shopItemDone` sí murió: el ítem que YA tienes no está «hecho», está en tu
   nevera, y ahora se llama `.shopItemHave`.

   Los 5 mockups se conservan enteros. Son el activo más caro de la sección y
   evitan cinco rásters en un mercado donde los datos móviles son caros.
   ========================================================================= */

/* Contrato de trazo, heredado de `figures/PlateExploded.jsx`. Aquí NO se traza
   nada: las dos guías anotadas son PUNTEADAS, así que llevan `VE` a secas y
   jamás `pathLength`. Bajo `pathLength={1}` un `stroke-dasharray: 3 4` se
   interpreta sobre un path normalizado a longitud 1, el primer trazo de 3 lo
   cubre entero y la guía se dibuja SÓLIDA — que es justo perder lo único que
   codifica «referencia, no materia» (§5.5).
   El SVG de las guías no lleva `viewBox` a propósito (ver el .module.css), así
   que hoy no hay escalado y `VE` es un no-op; va igualmente para que el
   contrato siga en pie si alguien le añade uno. */
const VE = { vectorEffect: 'non-scaling-stroke' };

/* Trazo de icono del sistema papel: 1,25 y color heredado. Los lucide venían
   a 2,4-3 y con color propio — a ese grosor un icono pesa más que la regla de
   1px que lo rodea. */
const ICON = { strokeWidth: 1.25 };

const VIEWS = [
    {
        id: 'plan',
        n: '01',
        label: 'PLAN DIARIO',
        title: 'Plan diario personalizado',
        desc: 'Cada día con desayuno, almuerzo, cena y meriendas calibrados a tus macros exactos.',
        figTag: 'Fig. 03.1',
        figText: 'Vista del día: cuatro comidas contra tu objetivo.',
    },
    {
        id: 'recipes',
        n: '02',
        label: 'RECETAS',
        title: 'Recetas paso a paso',
        desc: 'Cada plato con ingredientes en cantidades dominicanas y pasos claros para cocinarlo.',
        figTag: 'Fig. 03.2',
        figText: 'Ficha de plato: cantidades y preparación.',
    },
    {
        id: 'shopping',
        n: '03',
        label: 'LISTA DE COMPRAS',
        title: 'Lista de compras inteligente',
        desc: 'Generada automáticamente, agrupada por categorías y exportable a PDF.',
        figTag: 'Fig. 03.3',
        figText: 'Lista derivada del plan, por categoría.',
    },
    {
        id: 'chat',
        n: '04',
        label: 'NUTRICIONISTA IA',
        title: 'Nutricionista IA 24/7',
        desc: 'Pregunta, cambia comidas, registra lo que comiste — la IA responde al instante.',
        figTag: 'Fig. 03.4',
        figText: 'Consulta: un cambio y su efecto en la lista.',
    },
    {
        id: 'pantry',
        n: '05',
        label: 'NEVERA VIRTUAL',
        title: 'Nevera virtual',
        desc: 'La IA sabe qué tienes en casa y evita que compres lo que ya está en tu nevera.',
        figTag: 'Fig. 03.5',
        figText: 'Inventario de casa y avisos de uso.',
    },
];

/* Los dos rótulos de las guías anotadas. Son la única pieza de la lámina que
   dice qué HACE el producto en vez de qué preciso es, así que no se apagan
   bajo 1024px: cambian de forma (fila de texto entre vistas apiladas). */
const GUIDE_1 = '→ genera la lista con precios de colmado';
const GUIDE_2 = '→ descuenta lo que ya tienes en la nevera';

// ============================================================
//  Sub-componentes: un mockup por vista (compactos).
// ============================================================

export const PlanMockup = () => (
    <div className={styles.mockFrame}>
        <div className={styles.mockHeader}>
            <div>
                <strong>Tu plan de hoy</strong>
                <span className={styles.mockHeaderSub}>Lunes · Meta: 2,000 kcal</span>
            </div>
            <span className={styles.mockValue}>4 comidas</span>
        </div>
        <div className={styles.planMeals}>
            {[
                { tag: 'DESAYUNO', name: 'Mangú con huevos y queso', time: '15 min', kcal: 480 },
                { tag: 'ALMUERZO', name: 'Pollo guisado con moro', time: '35 min', kcal: 620 },
                { tag: 'MERIENDA', name: 'Yogurt griego con frutas', time: '5 min', kcal: 220 },
                { tag: 'CENA', name: 'Pescado al horno con vegetales', time: '30 min', kcal: 540 },
            ].map((m) => (
                <div key={m.tag} className={styles.planMeal}>
                    <div className={styles.planMealLeft}>
                        <span className={styles.planMealTag}>{m.tag}</span>
                        <strong className={styles.planMealName}>{m.name}</strong>
                        <span className={styles.planMealTime}><Clock size={12} {...ICON} /> {m.time}</span>
                    </div>
                    <div className={styles.planMealKcal}><strong>{m.kcal}</strong><small>kcal</small></div>
                </div>
            ))}
        </div>
        {/* Barra de progreso → pista de 1px, relleno sólido y el porcentaje en
            mono tabular a la derecha: el número deja de estar codificado solo
            en el largo de una barra de color. */}
        <div className={styles.planFooter}>
            <Flame size={13} {...ICON} />
            <span>Total: <strong>1,860 / 2,000 kcal</strong></span>
            <span className={styles.planProgress} aria-hidden="true"><span style={{ width: '93%' }} /></span>
            <span className={styles.planPct}>93%</span>
        </div>
    </div>
);

export const RecipesMockup = () => (
    <div className={styles.mockFrame}>
        <div className={styles.mockHeader}>
            <div>
                <strong>Pollo guisado con moro</strong>
                <span className={styles.mockHeaderSub}>Rinde 2 porciones · 35 min de cocción</span>
            </div>
            <span className={styles.mockValue}>Fácil</span>
        </div>
        <div className={styles.recipeBody}>
            <div className={styles.recipeIngredients}>
                <span className={styles.mockSubhead}>Ingredientes</span>
                <ul>
                    <li><span className={styles.recipeQty}>1 lb</span> Pechuga de pollo</li>
                    <li><span className={styles.recipeQty}>1 tz</span> Arroz blanco</li>
                    <li><span className={styles.recipeQty}>1/2 tz</span> Habichuelas negras</li>
                    <li><span className={styles.recipeQty}>1</span> Cebolla mediana</li>
                    <li><span className={styles.recipeQty}>2</span> Dientes de ajo</li>
                </ul>
            </div>
            <div className={styles.recipeSteps}>
                <span className={styles.mockSubhead}>Preparación</span>
                <ol>
                    <li><span className={styles.recipeStepNum}>1</span> Sofríe la cebolla y el ajo a fuego medio hasta dorar.</li>
                    <li><span className={styles.recipeStepNum}>2</span> Añade el pollo cortado en cubos y dora por 8 min.</li>
                    <li><span className={styles.recipeStepNum}>3</span> Agrega el arroz y las habichuelas, cubre con agua.</li>
                </ol>
            </div>
        </div>
    </div>
);

export const ShoppingMockup = () => (
    <div className={styles.mockFrame}>
        <div className={styles.mockHeader}>
            <div>
                <strong>Tu lista de compras</strong>
                <span className={styles.mockHeaderSub}>Para 7 días · 28 ingredientes</span>
            </div>
            <span className={styles.mockTag}><FileDown size={12} {...ICON} /> PDF</span>
        </div>
        {/* La leyenda va ARRIBA, no al pie: en desktop esta vista se recorta
            por el marco, y una clave de lectura que el recorte se puede comer
            no es una clave. Además es donde va la leyenda en una lámina. */}
        <div className={styles.shopLegend}>
            <span className={styles.shopLegendItem}>
                <span className={`${styles.shopMark} ${styles.shopMarkHave}`} aria-hidden="true" /> ya está en tu nevera
            </span>
            <span className={styles.shopLegendItem}>
                <span className={`${styles.shopMark} ${styles.shopMarkPending}`} aria-hidden="true" /> por comprar
            </span>
        </div>
        <div className={styles.shopBody}>
            {[
                { cat: 'Proteínas', items: [{ name: 'Pechuga de pollo', qty: '2 lb', have: true }, { name: 'Huevos', qty: '12 und', have: true }, { name: 'Pescado fresco', qty: '1 lb', have: false }] },
                { cat: 'Vegetales', items: [{ name: 'Plátano maduro', qty: '3 und', have: true }, { name: 'Cebolla', qty: '2 und', have: false }, { name: 'Cilantro fresco', qty: '1 atado', have: false }] },
            ].map((group) => (
                <div key={group.cat} className={styles.shopGroup}>
                    <span className={styles.mockSubhead}>{group.cat}</span>
                    <ul>
                        {/* Sólido = ya está; contorno = falta. El estado NO viaja
                            en el color del icono: viaja en el relleno del
                            cuadrado, y la leyenda de abajo lo dice impreso. */}
                        {group.items.map((item) => (
                            <li key={item.name} className={item.have ? styles.shopItemHave : styles.shopItemPending}>
                                <span className={styles.shopMark} aria-hidden="true" />
                                <span className={styles.shopName}>{item.name}</span>
                                <small>{item.qty}</small>
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </div>
    </div>
);

export const ChatMockup = () => (
    <div className={styles.mockFrame}>
        <div className={styles.mockHeader}>
            <div className={styles.chatHeaderRow}>
                {/* Cuadrado sólido con iniciales en mono: era un círculo con
                    degradado indigo y un icono dentro. */}
                <span className={styles.chatAvatar} aria-hidden="true">IA</span>
                <div>
                    <strong>Nutricionista IA</strong>
                    <span className={styles.mockHeaderSub}>En línea</span>
                </div>
            </div>
            <Sparkles size={15} className={styles.chatSparkle} {...ICON} />
        </div>
        <div className={styles.chatBody}>
            <div className={styles.chatBubbleUser}>¿Puedo cambiar el almuerzo de mañana? Hoy almorcé pollo.</div>
            <div className={styles.chatBubbleBot}>Claro — te sugiero pescado al horno con vegetales. Mantiene tus macros y rompe la rutina.</div>
            <div className={styles.chatBubbleUser}>Hazlo, gracias.</div>
            <div className={styles.chatBubbleBot}>Listo. Actualicé tu plan y la lista de compras. <strong>Pescado fresco · 1 lb</strong> añadido.</div>
        </div>
        <div className={styles.chatInputBar} aria-hidden="true">
            <span className={styles.chatInputPlaceholder}>Escribe lo que necesites…</span>
            <span className={styles.chatInputSend}><Send size={13} {...ICON} /></span>
        </div>
    </div>
);

export const PantryMockup = () => (
    <div className={styles.mockFrame}>
        <div className={styles.mockHeader}>
            <div>
                <strong>Lo que tienes en casa</strong>
                <span className={styles.mockHeaderSub}>18 ingredientes guardados</span>
            </div>
            <span className={styles.mockTag}><Plus size={12} {...ICON} /> Añadir</span>
        </div>
        <div className={styles.pantrySearch}>
            <Search size={13} {...ICON} />
            <span>Buscar en la nevera…</span>
        </div>
        {/* `data-state="soon"` ya no tiñe de naranja: sube el contorno del ítem
            a tinta plena y saca la etiqueta acotada. Peso de línea, no color. */}
        <div className={styles.pantryGrid}>
            {[
                { name: 'Arroz blanco', qty: '5 lb', state: 'fresh' },
                { name: 'Habichuelas', qty: '2 lb', state: 'fresh' },
                { name: 'Aceite de oliva', qty: '500 ml', state: 'fresh' },
                { name: 'Plátano maduro', qty: '3 und', state: 'soon', warn: 'Usar en 2 días' },
                { name: 'Cilantro', qty: '1 atado', state: 'soon', warn: 'Usar en 3 días' },
                { name: 'Huevos', qty: '8 und', state: 'fresh' },
            ].map((item) => (
                <div key={item.name} className={styles.pantryItem} data-state={item.state}>
                    <strong>{item.name}</strong>
                    <small>{item.qty}</small>
                    {item.state === 'soon' && (
                        <span className={styles.pantryWarn}><AlertTriangle size={11} {...ICON} /> {item.warn}</span>
                    )}
                </div>
            ))}
        </div>
    </div>
);

const MOCKUPS = {
    plan: <PlanMockup />,
    recipes: <RecipesMockup />,
    shopping: <ShoppingMockup />,
    chat: <ChatMockup />,
    pantry: <PantryMockup />,
};

/* Una vista de la lámina. El marco ENTERO es un solo enlace a /funciones — no
   hay objetivos táctiles pequeños dentro (ningún mockup es enlazable celda a
   celda), que es lo que permite escalar el interior bajo 1024px sin encoger
   nada pulsable. El mockup va `aria-hidden`: es un dibujo de una pantalla, y
   leerlo campo por campo con lector de pantalla es ruido — el cartucho, la
   descripción y el pie de figura sí son texto real. */
const View = ({ view, rise }) => (
    <motion.article className={`${styles.view} ${styles[`view${view.n}`]}`} variants={rise}>
        <Link
            to="/funciones"
            className={styles.viewLink}
            aria-label={`${view.title} — ver todas las funciones`}
        >
            <span className={styles.cartouche}>
                <span className={styles.cartoucheN}>{`VISTA ${view.n}`}</span>
                <span className={styles.cartoucheSep} aria-hidden="true">·</span>
                <span className={styles.cartoucheLabel}>{view.label}</span>
            </span>
            <span className={styles.viewDesc}>{view.desc}</span>
            <div className={styles.viewport}>
                <div className={styles.scaleBox} aria-hidden="true">{MOCKUPS[view.id]}</div>
            </div>
            {/* [P2-SECCIONES-03-04-DENSIDAD · 2026-08-02] Pie a DOS VOCES: prefijo
                mono en tinta + frase en PJS a --pa-ink-2. Es exactamente lo que
                `.caption`/`.captionTag` de las dos figuras de la sección 04 ya
                hacen, y lo que el spec §2.5 define para un pie de figura. Antes
                los cinco pies iban en mono 12 completo: cinco líneas grises
                idénticas que se leían como una banda, y que divergían del pie de
                la 04 sin ninguna razón. */}
            <span className={styles.figCaption}>
                <span className={styles.figTag}>{view.figTag}</span>
                {` — ${view.figText}`}
            </span>
        </Link>
    </motion.article>
);

View.propTypes = {
    view: PropTypes.shape({
        id: PropTypes.string.isRequired,
        n: PropTypes.string.isRequired,
        label: PropTypes.string.isRequired,
        title: PropTypes.string.isRequired,
        desc: PropTypes.string.isRequired,
        figTag: PropTypes.string.isRequired,
        figText: PropTypes.string.isRequired,
    }).isRequired,
    rise: PropTypes.object.isRequired,
};

/* Fila de guía para vistas apiladas (<1024px). No es una alternativa pobre al
   SVG: es la MISMA información con otra forma — regla punteada + el mismo
   rótulo mono. Se coloca justo antes de la vista a la que apunta.

   Lleva `variants` como las vistas y no por simetría de estilo: es un hijo
   directo del contenedor que orquesta el stagger, así que sin ellas entra a
   opacidad plena mientras los cinco marcos aún están subiendo — la guía
   llegaría ANTES que aquello a lo que apunta, que en una sección cuya tesis
   es «las guías explican el producto» es exactamente la inversión que no
   queremos. */
const GuideRow = ({ rise, children }) => (
    <motion.p className={styles.guideRow} variants={rise}>
        <span className={styles.guideRowRule} aria-hidden="true" />
        <span className={styles.guideRowText}>{children}</span>
    </motion.p>
);

GuideRow.propTypes = {
    rise: PropTypes.object.isRequired,
    children: PropTypes.node.isRequired,
};

const DashboardShowcase = () => {
    /* Reduced motion, defensa (a): `makeSectionMotion(reduce)` gatea las
       variants en su DEFINICIÓN (sin desplazamiento y duración ~0). La (b) es
       el bloque `@media (prefers-reduced-motion: reduce)` del .module.css: el
       guard global de index.css solo acorta duraciones, y framer-motion
       escribe los transforms inline vía WAAPI. */
    const reduce = useReducedMotion();
    const M = makeSectionMotion(reduce);

    return (
        <section className={styles.section} id="dashboard">
            <div className={styles.container}>
                <motion.div
                    className={styles.head}
                    variants={M.container} initial="hidden" whileInView="show"
                    viewport={{ once: true, amount: 0.6 }}
                >
                    <motion.div className={styles.sectionHead} variants={M.rise}>
                        <span className={styles.hLine} aria-hidden="true" />
                        {/* [P2-SECCIONES-TITULAR · 2026-08-02] Baja de `h2` a `p`: el
                            titular de verdad es el de abajo. Ver el comentario de
                            `.title` en el .module.css para por qué existe. */}
                        <p className={styles.sectionLabel}>03 / LAS PANTALLAS</p>
                        <span className={styles.hLine} aria-hidden="true" />
                    </motion.div>
                    <motion.h2 className={styles.title} variants={M.rise}>
                        La aplicación, por dentro
                    </motion.h2>
                    <motion.p className={styles.subtitle} variants={M.rise}>
                        Cinco superficies dibujadas a la misma escala sobre la misma hoja.
                    </motion.p>
                </motion.div>

                <motion.div
                    className={styles.sheet}
                    variants={M.container} initial="hidden" whileInView="show"
                    viewport={{ once: true, amount: 0.12 }}
                >
                    <View view={VIEWS[0]} rise={M.rise} />
                    <View view={VIEWS[1]} rise={M.rise} />
                    <GuideRow rise={M.rise}>{GUIDE_1}</GuideRow>
                    <View view={VIEWS[2]} rise={M.rise} />
                    <View view={VIEWS[3]} rise={M.rise} />
                    <GuideRow rise={M.rise}>{GUIDE_2}</GuideRow>
                    <View view={VIEWS[4]} rise={M.rise} />

                    {/* ── BANDA DE GUÍAS ANOTADAS (≥1024px) ───────────────────
                        ⚠ ANCLA DE RETÍCULA — LEER ANTES DE TOCAR LOS SPANS.
                        Las X de estas dos guías son PORCENTAJES DEL ANCHO DE LA
                        LÁMINA y están acopladas al reparto de columnas que fija
                        `.view01`…`.view05` en el .module.css (7 / 5 / 5 / 6 / 6):
                          · 20% y 10% caen dentro de la vista 01 (0 → 58,3%)
                          · 78% cae dentro de la vista 03 (58,3% → 100%)
                          · 88% cae dentro de la vista 05 (50% → 100%)
                        ⚠ Esos tres tramos son NOMINALES: 7/12, 5/12 y 6/12 SIN
                        descontar el `gap`. Los bordes reales a 1232px de lámina
                        (columna = 73,33px, gap = 32px) caen en 57,25% para el
                        canto derecho de la 01, 59,85% para el izquierdo de la 03
                        y 51,3% para el de la 05 — no en 58,3% y 50%. Las cuatro
                        X siguen dentro con holgura de sobra; si alguien las
                        mueve al filo, hay que rehacer la cuenta CON el gap.
                        Si alguien cambia esos `grid-column`, las guías se siguen
                        dibujando igual de bien — apuntando al vacío, y NADA
                        falla. No hay test que lo cace: hay que mirarlo.
                        Las Y van en px y salen de dos números fijos del layout:
                        la altura de la banda (104px) y el `gap` de la rejilla
                        (32px) — de ahí el -32 (borde inferior de las vistas 01 y
                        03) y el 136 (borde superior de la vista 05).
                        Sin flechas en las líneas a propósito: en este sistema
                        una cota con flechas es una afirmación de MEDIDA (ver la
                        cabecera de `figures/PlateExploded.jsx`). La flecha vive
                        en el texto del rótulo, que es lo que sí es una frase. */}
                    <motion.div className={styles.guideBand} variants={M.rise}>
                        <svg className={styles.guideSvg} role="presentation" aria-hidden="true" focusable="false">
                            {/* guía 1 — vista 01 → vista 03 */}
                            <circle className={styles.guideNode} cx="20%" cy="-32" r="2.5" {...VE} />
                            <line className={styles.guideLine} x1="20%" y1="-32" x2="20%" y2="40" {...VE} />
                            <line className={styles.guideLine} x1="20%" y1="40" x2="78%" y2="40" {...VE} />
                            <line className={styles.guideLine} x1="78%" y1="40" x2="78%" y2="-32" {...VE} />
                            <circle className={styles.guideNode} cx="78%" cy="-32" r="2.5" {...VE} />

                            {/* guía 2 — vista 01 → vista 05 */}
                            <circle className={styles.guideNode} cx="10%" cy="-32" r="2.5" {...VE} />
                            <line className={styles.guideLine} x1="10%" y1="-32" x2="10%" y2="84" {...VE} />
                            <line className={styles.guideLine} x1="10%" y1="84" x2="88%" y2="84" {...VE} />
                            <line className={styles.guideLine} x1="88%" y1="84" x2="88%" y2="136" {...VE} />
                            <circle className={styles.guideNode} cx="88%" cy="136" r="2.5" {...VE} />
                        </svg>
                        {/* Los rótulos son HTML real, no `<text>` del SVG: así
                            siguen en el árbol de accesibilidad en desktop (el
                            SVG va aria-hidden) y no dependen del escalado. */}
                        <span className={`${styles.guideLabel} ${styles.guideLabel1}`}>{GUIDE_1}</span>
                        <span className={`${styles.guideLabel} ${styles.guideLabel2}`}>{GUIDE_2}</span>
                    </motion.div>
                </motion.div>

                <SeeMoreLink to="/funciones">Explorar todas las funciones</SeeMoreLink>
            </div>
        </section>
    );
};

export default DashboardShowcase;
