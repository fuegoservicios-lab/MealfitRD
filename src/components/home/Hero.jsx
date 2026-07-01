import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, ChevronRight, BookOpen, Stethoscope, HeartPulse, ClipboardCheck, Wallet, Cpu } from 'lucide-react';
import styles from './Hero.module.css';
import { useHeroCta } from '../../context/HeroCtaContext';

// [HERO-KEYNOTE-STAGE · 2026-06-18] Rediseño "Premium spotlight + tipografía
// kinética" (Keynote Stage). Reemplaza por completo el fondo con imagen raster
// y, sobre todo, ELIMINA las rayas blancas diagonales del modo oscuro
// (repeating-linear-gradient, antiguo P3-DARK-BG-STRIPES). El fondo ahora es un
// "escenario": un SPOTLIGHT radial cae desde arriba-centro + una VIÑETA suave
// oscurece los bordes, todo construido SOLO con gradientes radiales (cero rayas,
// cero repeating-gradient). El 3D se logra con perspective + transform-style:
// preserve-3d + translateZ + gradientes radiales/cónicos para iluminar esferas.
//
// REDUCED MOTION (lección P2-HERO-STATIC-CARDS + depth-parallax/aurora-mesh):
// framer-motion escribe los transforms de entrada INLINE vía WAAPI, y el guard
// global de index.css solo acorta la DURACIÓN — no anula el desplazamiento/blur
// que framer ya escribió. Por eso `useReducedMotion()` gatea los variants en JS:
// cuando el usuario lo pide, las entradas hacen fade puro (sin y/blur), y los
// loops decorativos se congelan + se fijan en su pose de reposo vía el bloque
// @media (prefers-reduced-motion) del .css (doble defensa).

// Factory de variants — recibe el flag de reduced-motion para anular el
// desplazamiento/blur de entrada cuando corresponde.
const makeVariants = (reduce) => ({
    container: {
        hidden: {},
        show: {
            transition: {
                staggerChildren: reduce ? 0 : 0.09,
                delayChildren: reduce ? 0 : 0.1,
            },
        },
    },
    rise: {
        hidden: { opacity: 0, y: reduce ? 0 : 22 },
        show: {
            opacity: 1,
            y: 0,
            transition: { duration: reduce ? 0.001 : 0.7, ease: [0.22, 1, 0.36, 1] },
        },
    },
    // Reveal editorial por línea del titular. Anima un WRAPPER (no el span que
    // clipea el gradiente) para no combinar filter:blur con -webkit-background-
    // clip:text en el mismo elemento (artefacto de repintado en WebKit/Safari).
    titleLine: {
        hidden: { opacity: 0, y: reduce ? 0 : 26, filter: reduce ? 'blur(0px)' : 'blur(10px)' },
        show: {
            opacity: 1,
            y: 0,
            filter: 'blur(0px)',
            transition: { duration: reduce ? 0.001 : 0.85, ease: [0.22, 1, 0.36, 1] },
        },
    },
    // Tarjetas-métrica: entran individualmente (conserva la coreografía de
    // entrada del visual original) y luego viven en el plano 3D.
    card: {
        hidden: { opacity: 0, y: reduce ? 0 : 24, scale: reduce ? 1 : 0.92 },
        show: {
            opacity: 1,
            y: 0,
            scale: 1,
            transition: { duration: reduce ? 0.001 : 0.7, ease: [0.22, 1, 0.36, 1] },
        },
    },
});

const Hero = () => {
    const { setHeroCtaVisible } = useHeroCta();
    const ctaRef = useRef(null);
    const reduce = useReducedMotion();
    const V = makeVariants(reduce);

    // [HEADER-STICKY-CTA · 2026-05-31] Reporta al Header (vía contexto) si el CTA
    // principal del Hero está en pantalla. El rootMargin top negativo ≈ altura del
    // header fixed (70px) para que el Header revele su CTA sticky justo cuando este
    // botón se desliza por detrás del header — no cuando toca el borde del viewport.
    useEffect(() => {
        const el = ctaRef.current;
        if (!el || typeof IntersectionObserver === 'undefined') return undefined;
        const observer = new IntersectionObserver(
            ([entry]) => setHeroCtaVisible(entry.isIntersecting),
            { rootMargin: '-72px 0px 0px 0px', threshold: 0 }
        );
        observer.observe(el);
        return () => {
            observer.disconnect();
            // Al desmontar (salir del landing) reseteamos a "visible" para que el
            // sticky arranque oculto la próxima vez que se monte el Hero.
            setHeroCtaVisible(true);
        };
    }, [setHeroCtaVisible]);

    return (
        <section className={styles.hero}>
            {/* ── Escenario (fondo) ─────────────────────────────────────────
                Capas puramente decorativas, aria-hidden. Sin imagen, sin rayas,
                sin repeating-gradient. Todo gradientes radiales/cónicos.
                1) spotlight: cono de luz radial desde arriba-centro.
                2) auroraA/auroraB: dos blobs de color de marca (blur grande,
                   deriva lentísima) → profundidad cromática sin distraer.
                3) grid: malla de PUNTOS sutilísima (textura premium, NO líneas),
                   enmascarada a los bordes para no competir con el contenido.
                4) vignette: oscurecimiento suave hacia los bordes. */}
            <div className={styles.stage} aria-hidden="true">
                <div className={styles.spotlight} />
                <div className={`${styles.aurora} ${styles.auroraA}`} />
                <div className={`${styles.aurora} ${styles.auroraB}`} />
                <div className={styles.grid} />
                <div className={styles.vignette} />
            </div>

            <div className={styles.container}>
                <motion.div
                    className={styles.content}
                    variants={V.container}
                    initial="hidden"
                    animate="show"
                >
                    <h1 className={styles.title}>
                        {/* Wrapper anima (y/opacity/blur); el span interno clipea
                            el gradiente. Separar capas evita el artefacto WebKit
                            de background-clip:text + filter:blur simultáneos. */}
                        <motion.span className={styles.titleLine} variants={V.titleLine}>
                            <span className={styles.titleInner}>Nutrición calculada,</span>
                        </motion.span>
                        <br />
                        <motion.span className={styles.titleLine} variants={V.titleLine}>
                            <span className={`${styles.titleInner} ${styles.gradientText}`}>
                                no improvisada
                            </span>
                        </motion.span>
                    </h1>

                    <motion.p className={styles.subtitle} variants={V.rise}>
                        Planes personalizados a tu perfil de salud, con <strong>precisión de macronutrientes</strong> y criterios clínicos fundamentados en evidencia. Con revisión profesional cuando tu condición lo amerita.
                    </motion.p>

                    {/* [P3-HERO-CTA-REFINE · 2026-06-28] El hero NO duplica el CTA de crear
                        plan (ese vive siempre en el header). Aquí solo el botón explorar →
                        página del motor (/motor). */}
                    <motion.div className={styles.actions} ref={ctaRef} variants={V.rise}>
                        <Link to="/motor" className={styles.secondaryBtn}>
                            <span className={styles.btnLabel}><Cpu size={18} strokeWidth={2.25} /> Conoce el motor</span>
                        </Link>
                    </motion.div>

                    <motion.div className={styles.trust} variants={V.rise}>
                        <div className={styles.trustItem}>
                            <BookOpen size={16} className={styles.trustIcon} strokeWidth={2.25} />
                            <span>Fundamentado en evidencia</span>
                        </div>
                        <div className={styles.trustItem}>
                            <Stethoscope size={16} className={styles.trustIcon} strokeWidth={2.25} />
                            <span>Criterios clínicos</span>
                        </div>
                        <div className={styles.trustItem}>
                            <HeartPulse size={16} className={styles.trustIcon} strokeWidth={2.25} />
                            <span>Personalizado a tu perfil</span>
                        </div>
                        <div className={styles.trustItem}>
                            <ClipboardCheck size={16} className={styles.trustIcon} strokeWidth={2.25} />
                            <span>Revisión profesional</span>
                        </div>
                        <div className={styles.trustItem}>
                            <Wallet size={16} className={styles.trustIcon} strokeWidth={2.25} />
                            <span>Adaptado a tu presupuesto</span>
                        </div>
                    </motion.div>
                </motion.div>

                <motion.div
                    className={styles.visual}
                    variants={V.container}
                    initial="hidden"
                    animate="show"
                >
                    {/* Escena 3D: la perspective vive en .visual; .stage3d es el
                        plano que rota muy sutil (±5°) en loop lento; los hijos se
                        separan con translateZ para profundidad real (parallax al
                        rotar). */}
                    <div className={styles.stage3d}>
                        {/* [P3-HERO-ORB-VIDEO · 2026-06-30] La esfera CSS (orb + ring +
                            glow) se reemplazó por un video 3D (orb.webm/mp4) clipeado con
                            máscara radial que funde el borde rectangular y el fondo dot-grid
                            del video con el fondo del hero. Reduced-motion → poster estático.
                            El landing es dark-only, así que el fondo navy del video coincide. */}
                        {reduce ? (
                            <img className={styles.orbVideo} src="/orb-poster.jpg" alt="" aria-hidden="true" />
                        ) : (
                            <video
                                className={styles.orbVideo}
                                autoPlay
                                loop
                                muted
                                playsInline
                                poster="/orb-poster.jpg"
                                aria-hidden="true"
                            >
                                <source src="/orb.webm" type="video/webm" />
                                <source src="/orb.mp4" type="video/mp4" />
                            </video>
                        )}

                        {/* [P3-HERO-ORB-SOLO · 2026-06-30] Tarjetas-métrica flotantes
                            eliminadas a pedido — el orbe-video queda solo, protagonista. */}
                    </div>
                </motion.div>
            </div>
        </section>
    );
};

export default Hero;