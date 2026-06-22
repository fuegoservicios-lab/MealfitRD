import { useEffect, useRef } from 'react';
import styles from '../../pages/Auth.module.css';

// [P1-AUTH-BG-3D · 2026-06-21] Fondo del login: estructuras "moleculares" 3D
// (icosaedros wireframe) rotando lento sobre un fondo oscuro, en teal sutil.
// Minimalista + científico + profesional — evoca la nutrición CALCULADA de la
// marca, sin imágenes brillosas/coloridas. Canvas 2D puro (proyección 3D a mano)
// → CERO dependencia (nada de Three.js, importa para LCP de una ruta pública).
// Respeta prefers-reduced-motion (frame estático) y pausa con la pestaña oculta.

const PHI = (1 + Math.sqrt(5)) / 2;

// Vértices del icosaedro (12) — forma cristalina/molecular, "científica".
const ICO_VERTS = [
    [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
    [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
    [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
];

const _d2 = (a, b) => {
    const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
    return dx * dx + dy * dy + dz * dz;
};

// Aristas = pares a la distancia mínima (las 30 del icosaedro), computadas para
// no hardcodear índices frágiles.
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

// Composición: 3 moléculas que enmarcan la tarjeta (centro), distintos tamaños,
// profundidades y velocidades → sensación de capas 3D sin saturar.
const MOLECULES = [
    { fx: 0.20, fy: 0.30, r: 130, speed: 0.9, tilt: 0.5, phase: 0.0 },
    { fx: 0.82, fy: 0.70, r: 185, speed: -0.6, tilt: -0.3, phase: 2.1 },
    { fx: 0.70, fy: 0.16, r: 80, speed: 1.3, tilt: 0.9, phase: 4.2 },
];

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

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
        const resize = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            w = canvas.clientWidth;
            h = canvas.clientHeight;
            canvas.width = Math.max(1, Math.round(w * dpr));
            canvas.height = Math.max(1, Math.round(h * dpr));
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        resize();
        window.addEventListener('resize', resize);

        const FOCAL = 5;

        const drawMolecule = (m, t) => {
            const cx = m.fx * w + Math.sin(t * 0.00018 + m.phase) * 16;   // deriva suave
            const cy = m.fy * h + Math.cos(t * 0.00015 + m.phase) * 16;
            const ay = t * 0.00010 * m.speed + m.phase;                    // rotación Y
            const ax = m.tilt + Math.sin(t * 0.00006 + m.phase) * 0.25;    // tilt animado
            const cosY = Math.cos(ay), sinY = Math.sin(ay);
            const cosX = Math.cos(ax), sinX = Math.sin(ax);
            const k = m.r / 1.9; // vértices ~±1.9 → radio ~m.r px

            const pts = ICO_VERTS.map(([x0, y0, z0]) => {
                // rotateY
                const xr = x0 * cosY + z0 * sinY;
                const zr = -x0 * sinY + z0 * cosY;
                // rotateX
                const yr = y0 * cosX - zr * sinX;
                const zr2 = y0 * sinX + zr * cosX;
                const scale = FOCAL / (FOCAL + zr2);
                return { x: cx + xr * scale * k, y: cy + yr * scale * k, scale };
            });

            // Aristas (líneas finas, opacidad por profundidad).
            for (const [i, j] of ICO_EDGES) {
                const a = pts[i], b = pts[j];
                const alpha = clamp(0.10 * ((a.scale + b.scale) / 2), 0.04, 0.20);
                ctx.strokeStyle = `rgba(45, 212, 191, ${alpha.toFixed(3)})`;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.stroke();
            }
            // Vértices (puntos teal, los cercanos más brillantes).
            for (const p of pts) {
                const alpha = clamp(0.28 * p.scale, 0.12, 0.5);
                ctx.fillStyle = `rgba(94, 234, 212, ${alpha.toFixed(3)})`;
                ctx.beginPath();
                ctx.arc(p.x, p.y, clamp(1.5 * p.scale, 0.8, 2.6), 0, Math.PI * 2);
                ctx.fill();
            }
        };

        const draw = (t) => {
            ctx.clearRect(0, 0, w, h);
            for (const m of MOLECULES) drawMolecule(m, t);
        };

        let raf = 0;
        let running = false;
        const loop = (t) => { draw(t); raf = window.requestAnimationFrame(loop); };
        const start = () => { if (!running && !reduced) { running = true; raf = window.requestAnimationFrame(loop); } };
        const stop = () => { running = false; if (raf) window.cancelAnimationFrame(raf); };

        if (reduced) {
            draw(1200); // un frame estático compuesto
        } else {
            start();
        }

        const onVis = () => { if (document.hidden) stop(); else start(); };
        document.addEventListener('visibilitychange', onVis);

        return () => {
            stop();
            window.removeEventListener('resize', resize);
            document.removeEventListener('visibilitychange', onVis);
        };
    }, []);

    return <canvas ref={canvasRef} className={styles.bgCanvas} aria-hidden="true" />;
}
