import { useEffect, useRef } from 'react';
import styles from '../../pages/Auth.module.css';

// [P1-AUTH-BG-3D · 2026-06-21 · v2 2026-06-22] Fondo del login: estructuras
// "moleculares" 3D (icosaedros wireframe) rotando lento sobre fondo oscuro, en
// teal sutil — científico/profesional/minimalista. v2 añade profundidad y vida:
//   · glow suave en cada nodo (faint halo + bright core, sin shadowBlur → barato)
//   · PARALLAX con el mouse (las capas se desplazan distinto → 3D real)
//   · campo de partículas (átomos flotando) con parallax propio
//   · capas de profundidad (cerca=grande/brillante, lejos=pequeño/tenue)
//   · glow central teal que "respira"
// Canvas 2D puro (proyección 3D a mano) → CERO dependencias. Respeta
// prefers-reduced-motion (frame estático, sin parallax) y pausa con pestaña oculta.

const PHI = (1 + Math.sqrt(5)) / 2;

const ICO_VERTS = [
    [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
    [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
    [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
];

const _d2 = (a, b) => {
    const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
    return dx * dx + dy * dy + dz * dz;
};

const ICO_EDGES = (() => {
    let min = Infinity;
    for (let i = 0; i < ICO_VERTS.length; i++)
        for (let j = i + 1; j < ICO_VERTS.length; j++)
            min = Math.min(min, _d2(ICO_VERTS[i], ICO_VERTS[j]));
    const edges = [];
    const eps = min * 0.05;
    for (let i = 0; i < ICO_VERTS.length; i++)
        for (let j = i + 1; j < ICO_VERTS.length; j++)
            if (Math.abs(_d2(ICO_VERTS[i], ICO_VERTS[j]) - min) < eps) edges.push([i, j]);
    return edges;
})();

// fx,fy = posición relativa; r = radio px; depth 0..1 (1=cerca → más brillo +
// más parallax); speed = velocidad de rotación; tilt = inclinación; phase = desfase.
const MOLECULES = [
    { fx: 0.17, fy: 0.30, r: 140, depth: 0.95, speed: 0.9, tilt: 0.5, phase: 0.0 },
    { fx: 0.84, fy: 0.66, r: 205, depth: 0.70, speed: -0.6, tilt: -0.3, phase: 2.1 },
    { fx: 0.72, fy: 0.15, r: 95, depth: 1.0, speed: 1.3, tilt: 0.9, phase: 4.2 },
    { fx: 0.45, fy: 0.86, r: 120, depth: 0.40, speed: 0.5, tilt: -0.6, phase: 5.5 },
];

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// Pseudo-random determinista (sin Math.random → SSR/StrictMode-safe y estable).
function _rng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

export default function AuthBackground() {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return undefined;
        const ctx = canvas.getContext('2d');
        if (!ctx) return undefined;

        const reduced = typeof window.matchMedia === 'function'
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        let w = 0, h = 0;
        let particles = [];
        const seedParticles = () => {
            const rnd = _rng(20260622);
            const count = Math.round(clamp((w * h) / 46000, 22, 60));
            particles = Array.from({ length: count }, () => ({
                x: rnd() * w,
                y: rnd() * h,
                z: 0.3 + rnd() * 0.9,            // profundidad (tamaño/brillo/parallax)
                vx: (rnd() - 0.5) * 0.16,        // deriva lenta px/frame
                vy: (rnd() - 0.5) * 0.16,
            }));
        };

        const resize = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            w = canvas.clientWidth;
            h = canvas.clientHeight;
            canvas.width = Math.max(1, Math.round(w * dpr));
            canvas.height = Math.max(1, Math.round(h * dpr));
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            seedParticles();
        };
        resize();
        window.addEventListener('resize', resize);

        // --- Parallax con el mouse (suavizado) ---
        let targetMx = 0, targetMy = 0, mx = 0, my = 0;
        const onPointer = (e) => {
            targetMx = (e.clientX / window.innerWidth) * 2 - 1;   // -1..1
            targetMy = (e.clientY / window.innerHeight) * 2 - 1;
        };
        if (!reduced) window.addEventListener('pointermove', onPointer, { passive: true });
        const PAR = 26; // desplazamiento máx en px

        const FOCAL = 5;
        const TEAL = '94, 234, 212';   // nodos (teal claro)
        const EDGE = '45, 212, 191';   // aristas

        // Punto teal con halo (glow barato: círculo grande tenue + núcleo brillante).
        const glowDot = (x, y, r, a) => {
            ctx.fillStyle = `rgba(${TEAL}, ${(a * 0.22).toFixed(3)})`;
            ctx.beginPath(); ctx.arc(x, y, r * 3.2, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = `rgba(${TEAL}, ${a.toFixed(3)})`;
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        };

        const drawMolecule = (m, t) => {
            const px = mx * PAR * m.depth;     // parallax por capa (cerca = más)
            const py = my * PAR * m.depth;
            const cx = m.fx * w + Math.sin(t * 0.00018 + m.phase) * 16 + px;
            const cy = m.fy * h + Math.cos(t * 0.00015 + m.phase) * 16 + py;
            const ay = t * 0.00010 * m.speed + m.phase;
            const ax = m.tilt + Math.sin(t * 0.00006 + m.phase) * 0.25;
            const cosY = Math.cos(ay), sinY = Math.sin(ay);
            const cosX = Math.cos(ax), sinX = Math.sin(ax);
            const k = m.r / 1.9;

            const pts = ICO_VERTS.map(([x0, y0, z0]) => {
                const xr = x0 * cosY + z0 * sinY;
                const zr = -x0 * sinY + z0 * cosY;
                const yr = y0 * cosX - zr * sinX;
                const zr2 = y0 * sinX + zr * cosX;
                const scale = FOCAL / (FOCAL + zr2);
                return { x: cx + xr * scale * k, y: cy + yr * scale * k, scale };
            });

            for (const [i, j] of ICO_EDGES) {
                const a = pts[i], b = pts[j];
                const alpha = clamp(0.11 * ((a.scale + b.scale) / 2) * m.depth, 0.03, 0.22);
                ctx.strokeStyle = `rgba(${EDGE}, ${alpha.toFixed(3)})`;
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
            }
            for (const p of pts) {
                glowDot(p.x, p.y, clamp(1.5 * p.scale, 0.8, 2.6), clamp(0.30 * p.scale * m.depth, 0.10, 0.55));
            }
        };

        const drawParticles = () => {
            for (const pt of particles) {
                pt.x += pt.vx; pt.y += pt.vy;
                if (pt.x < -10) pt.x = w + 10; else if (pt.x > w + 10) pt.x = -10;
                if (pt.y < -10) pt.y = h + 10; else if (pt.y > h + 10) pt.y = -10;
                const dx = mx * PAR * 0.5 * pt.z;
                const dy = my * PAR * 0.5 * pt.z;
                glowDot(pt.x + dx, pt.y + dy, clamp(1.1 * pt.z, 0.6, 1.8), clamp(0.16 * pt.z, 0.05, 0.18));
            }
        };

        const drawAtmosphere = (t) => {
            const breathe = 0.5 + 0.5 * Math.sin(t * 0.0002);
            const g = ctx.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.42, Math.max(w, h) * 0.55);
            g.addColorStop(0, `rgba(45, 212, 191, ${(0.05 + 0.03 * breathe).toFixed(3)})`);
            g.addColorStop(1, 'rgba(45, 212, 191, 0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, w, h);
        };

        const draw = (t) => {
            // ease del parallax
            mx += (targetMx - mx) * 0.05;
            my += (targetMy - my) * 0.05;
            ctx.clearRect(0, 0, w, h);
            drawAtmosphere(t);
            drawParticles();
            for (const m of MOLECULES) drawMolecule(m, t);
        };

        let raf = 0;
        let running = false;
        const loop = (t) => { draw(t); raf = window.requestAnimationFrame(loop); };
        const start = () => { if (!running && !reduced) { running = true; raf = window.requestAnimationFrame(loop); } };
        const stop = () => { running = false; if (raf) window.cancelAnimationFrame(raf); };

        if (reduced) draw(1600); else start();

        const onVis = () => { if (document.hidden) stop(); else start(); };
        document.addEventListener('visibilitychange', onVis);

        return () => {
            stop();
            window.removeEventListener('resize', resize);
            window.removeEventListener('pointermove', onPointer);
            document.removeEventListener('visibilitychange', onVis);
        };
    }, []);

    return <canvas ref={canvasRef} className={styles.bgCanvas} aria-hidden="true" />;
}
