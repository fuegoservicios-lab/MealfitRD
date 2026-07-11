import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { BookOpen, Stethoscope, HeartPulse, ClipboardCheck, Wallet, Cpu } from 'lucide-react';
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

    // [P2-HERO-VIDEO-DEFER · 2026-07-09] El orbe-video (orb.webm 1.16MB /
    // orb.mp4 2.78MB — el asset más pesado del sitio) se montaba con autoPlay
    // → descarga completa compitiendo con el critical path en la primera
    // pantalla, en un mercado móvil con datos caros. Ahora: el poster (27KB)
    // pinta primero SIEMPRE; el <video> se monta recién cuando (a) el efecto
    // post-mount corre (fuera del first paint), (b) el stage está en viewport
    // (IntersectionObserver — cubre aterrizajes con scroll restaurado abajo),
    // y (c) el usuario NO pidió ahorro de datos (Save-Data). Reduced-motion
    // sigue mostrando solo el poster, como antes.
    const stageRef = useRef(null);
    const [videoOn, setVideoOn] = useState(false);
    // [P1-HERO-ORB-AUTOPLAY · 2026-07-11] En móviles el orbe quedaba CONGELADO:
    // Chrome Android evalúa el content attribute `muted` para permitir autoplay,
    // pero React solo escribe la PROPIEDAD (bug conocido de React) → el <video>
    // montaba con autoPlay y jamás arrancaba (reproducido vía CDP: paused=true /
    // currentTime=0 bajo emulación móvil; desktop sí reproducía). videoAlive=false
    // marca "autoplay denegado" → el orbe recibe un breath CSS (transform/opacity)
    // para no verse muerto, y se reintenta play() en el primer gesto (cubre
    // también iOS Low Power Mode).
    const videoRef = useRef(null);
    const [videoAlive, setVideoAlive] = useState(true);
    // Assets móviles: orb-sm.* es un recorte cuadrado 640² (~2.25× menos costo de
    // decode que el 1280×720 de desktop — clave en gama baja sin decode VP9 por
    // hardware, y menos MB en un mercado con datos caros). Se decide una vez al
    // montar: el breakpoint no cambia en la práctica sin remount del landing.
    const [smallScreen] = useState(() => {
        try {
            return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
        } catch {
            return false;
        }
    });
    useEffect(() => {
        if (reduce || videoOn) return undefined;
        const conn = typeof navigator !== 'undefined' ? navigator.connection : undefined;
        if (conn && conn.saveData === true) return undefined;
        const el = stageRef.current;
        if (!el || typeof IntersectionObserver === 'undefined') {
            setVideoOn(true);
            return undefined;
        }
        const io = new IntersectionObserver((entries) => {
            if (entries.some((e) => e.isIntersecting)) {
                setVideoOn(true);
                io.disconnect();
            }
        }, { rootMargin: '120px' });
        io.observe(el);
        return () => io.disconnect();
    }, [reduce, videoOn]);

    // [P1-HERO-ORB-AUTOPLAY · 2026-07-11] Arranque resiliente del video:
    // 1) muted como attribute+prop+defaultMuted (la política de Chrome Android
    //    mira el atributo, que React no escribe), 2) play() explícito con catch
    //    → breath fallback, 3) retry en el primer gesto, 4) pausa fuera de
    //    viewport (batería) y resume al volver.
    useEffect(() => {
        if (!videoOn || reduce) return undefined;
        const el = videoRef.current;
        if (!el) return undefined;
        el.muted = true;
        el.defaultMuted = true;
        el.setAttribute('muted', '');
        let disposed = false;
        const tryPlay = () => {
            const p = el.play();
            if (p && typeof p.then === 'function') {
                p.then(() => { if (!disposed) setVideoAlive(true); })
                    .catch((err) => {
                        // AbortError = play() interrumpido por nuestro propio
                        // pause() (p.ej. el observer de visibilidad cuando el
                        // orbe monta bajo el fold en móvil) — NO es un veto de
                        // autoplay; no degradar a breath. Solo NotAllowedError
                        // y afines marcan el video como no-vivo.
                        if (!disposed && (!err || err.name !== 'AbortError')) setVideoAlive(false);
                    });
            }
        };
        tryPlay();
        const onFirstGesture = () => tryPlay();
        window.addEventListener('pointerdown', onFirstGesture, { once: true, passive: true });
        const io = typeof IntersectionObserver !== 'undefined'
            ? new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) tryPlay();
                    else el.pause();
                });
            }, { threshold: 0 })
            : null;
        if (io) io.observe(el);
        return () => {
            disposed = true;
            window.removeEventListener('pointerdown', onFirstGesture);
            if (io) io.disconnect();
        };
    }, [videoOn, reduce]);

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
                    <div className={styles.stage3d} ref={stageRef}>
                        {/* [P3-HERO-ORB-VIDEO · 2026-06-30] La esfera CSS (orb + ring +
                            glow) se reemplazó por un video 3D (orb.webm/mp4) clipeado con
                            máscara radial que funde el borde rectangular y el fondo dot-grid
                            del video con el fondo del hero. Reduced-motion → poster estático.
                            El landing es dark-only, así que el fondo navy del video coincide.
                            [P2-HERO-VIDEO-DEFER · 2026-07-09] El video monta diferido
                            (post-paint + en viewport + sin Save-Data); poster primero. */}
                        {(reduce || !videoOn) ? (
                            // Poster con breath sutil (transform/opacity, GPU-only) para
                            // que el path sin video (Save-Data, pre-mount) no se vea
                            // congelado. Reduced-motion → estático puro, como siempre.
                            <img
                                className={`${styles.orbVideo}${reduce ? '' : ` ${styles.orbBreath}`}`}
                                src="/orb-poster.jpg"
                                alt=""
                                aria-hidden="true"
                            />
                        ) : (
                            <video
                                ref={videoRef}
                                className={`${styles.orbVideo}${videoAlive ? '' : ` ${styles.orbBreath}`}`}
                                autoPlay
                                loop
                                muted
                                playsInline
                                poster="/orb-poster.jpg"
                                aria-hidden="true"
                            >
                                <source src={smallScreen ? '/orb-sm.webm' : '/orb.webm'} type="video/webm" />
                                <source src={smallScreen ? '/orb-sm.mp4' : '/orb.mp4'} type="video/mp4" />
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