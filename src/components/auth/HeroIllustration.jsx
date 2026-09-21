// [P1-PLAN-LOTE-144 · 2026-09-20] Ilustración hero del login (SOLO móvil): el bol con su brote y la constelación
// de macros — ahora VIVA. El dueño: «anima el de móviles». Era un line-art estático; la historia que cuenta
// («tus macros acaban en tu plato») no se veía porque nada se movía.
//
//   entrada  las líneas se DIBUJAN (pathLength=1 + dashoffset), el tallo crece, las hojas brotan con rebote y
//            los macros aparecen de uno en uno
//   reposo   cada macro respira (su halo), las hojas se mecen, y una gota de cada color viaja por su línea
//            hasta el bol, que responde con una onda
//
// Todo el movimiento es CSS (clases `mf-illu-*` en Login.css) salvo las gotas, que siguen un trazo y eso es
// SMIL (`animateMotion`): un media query no lo apaga, así que con reduce-motion directamente NO se montan.
// Nada se traslada de sitio en reposo a propósito: un nodo que flota se despega de sus líneas.
import { useMediaQuery } from '../../hooks/useMediaQuery';

// centro del bol: adonde llegan las gotas
const BOL = '132 150';
const GOTAS = [
    { d: `M70 72 L${BOL}`, color: 'var(--mf-primary)', dur: '3.2s', begin: '1.9s' },
    { d: `M198 64 L${BOL}`, color: 'var(--mf-accent)', dur: '3.6s', begin: '2.6s' },
    { d: `M218 122 L198 64 L${BOL}`, color: 'var(--mf-fat)', dur: '4.4s', begin: '3.1s' },
    { d: `M46 124 L70 72 L${BOL}`, color: 'var(--mf-secondary)', dur: '4.1s', begin: '3.8s' },
];
const NODOS = [
    { cx: 70, cy: 72, r: 11, color: 'var(--mf-primary)', i: 0 },
    { cx: 198, cy: 64, r: 13.5, color: 'var(--mf-accent)', i: 1 },
    { cx: 218, cy: 122, r: 8.5, color: 'var(--mf-fat)', i: 2 },
    { cx: 46, cy: 124, r: 7.5, color: 'var(--mf-secondary)', i: 3 },
];

export default function HeroIllustration() {
    const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
    return (
        <svg className="mf-illu" viewBox="0 0 260 196" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
                <radialGradient id="mfIlluHalo" cx="50%" cy="50%" r="50%">
                    <stop offset="0" stopColor="#34D399" stopOpacity="0.30" />
                    <stop offset="1" stopColor="#34D399" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="mfIlluBrillo" cx="32%" cy="28%" r="70%">
                    <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
                    <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
                </radialGradient>
                <linearGradient id="mfIlluBol" x1="76" y1="150" x2="188" y2="190" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#F1F5F9" /><stop offset="1" stopColor="#A5B4FC" />
                </linearGradient>
                <linearGradient id="mfIlluBolFondo" x1="0" y1="150" x2="0" y2="192" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#fff" stopOpacity="0.10" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
                </linearGradient>
            </defs>

            {/* resplandor tras el brote */}
            <circle className="mf-illu-halo" cx="132" cy="104" r="74" fill="url(#mfIlluHalo)" />

            {/* constelación: líneas finas que conectan los nodos (se dibujan) */}
            <g stroke="var(--mf-text-faint)" strokeWidth="1.4" strokeLinecap="round" opacity="0.55">
                {['M132 150 L70 72', 'M132 150 L198 64', 'M70 72 L198 64', 'M198 64 L218 122', 'M70 72 L46 124'].map((d, i) => (
                    <path key={d} className="mf-illu-linea" style={{ '--i': i }} pathLength="1" d={d} />
                ))}
            </g>

            {/* gotas: cada macro viaja por su línea hasta el bol */}
            {!reduced && GOTAS.map((g) => (
                <circle key={g.d} r="2.8" fill={g.color} opacity="0">
                    <animateMotion path={g.d} dur={g.dur} begin={g.begin} repeatCount="indefinite"
                        calcMode="spline" keyPoints="0;1" keyTimes="0;1" keySplines="0.45 0 0.55 1" />
                    <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.12;0.82;1"
                        dur={g.dur} begin={g.begin} repeatCount="indefinite" />
                </circle>
            ))}

            {/* sombra del bol + bol (relleno tenue y trazo continuo) */}
            <ellipse className="mf-illu-sombra" cx="132" cy="190" rx="44" ry="4.5" fill="#000" opacity="0.35" />
            <path d="M84 150 Q132 196 180 150 Z" fill="url(#mfIlluBolFondo)" />
            <g stroke="url(#mfIlluBol)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                <path className="mf-illu-bol" pathLength="1" d="M84 150 Q132 196 180 150" />
                <path className="mf-illu-bol" pathLength="1" d="M76 149 H188" />
            </g>

            {/* brote: tallo que crece + dos hojas que brotan y se mecen */}
            <path className="mf-illu-tallo" pathLength="1" d="M132 148 C132 122 132 106 132 84" stroke="var(--mf-secondary)" strokeWidth="2.6" strokeLinecap="round" />
            <g className="mf-illu-hoja mf-illu-hoja--a">
                <path d="M132 108 C116 104 108 90 113 76 C129 80 138 98 132 108 Z" fill="var(--mf-secondary)" opacity="0.92" />
            </g>
            <g className="mf-illu-hoja mf-illu-hoja--b">
                <path d="M132 94 C142 91 149 82 147 71 C136 73 129 85 132 94 Z" fill="#6EE7B7" opacity="0.9" />
            </g>

            {/* onda del bol: responde a las gotas que llegan */}
            <circle className="mf-illu-onda" cx="132" cy="150" r="5" stroke="var(--mf-text)" strokeWidth="1.2" />
            <circle className="mf-illu-centro" cx="132" cy="150" r="5" fill="var(--mf-text)" />

            {/* nodos de macros: halo que respira + orbe con brillo */}
            {NODOS.map((n) => (
                <g key={n.i} className="mf-illu-nodo" style={{ '--i': n.i }}>
                    <circle className="mf-illu-nodo__halo" cx={n.cx} cy={n.cy} r={n.r * 1.9} fill={n.color} />
                    <circle cx={n.cx} cy={n.cy} r={n.r} fill={n.color} />
                    <circle cx={n.cx} cy={n.cy} r={n.r} fill="url(#mfIlluBrillo)" />
                </g>
            ))}
        </svg>
    );
}
