// [P3-AVATAR-PICKER · 2026-06-20] Set de avatares minimalistas estilo Anthropic:
// paleta cálida y sobria (clay/sage/slate/ámbar…) + una forma geométrica simple
// en tono crema sobre un disco de color. Cero dependencias; cada avatar es un
// SVG circular puro y determinista.

const CREAM = '#F4EEE3';

// Cada entrada: { id, bg, mark(cream, bg) -> hijos SVG }. La marca se dibuja
// sobre el disco de fondo (cx/cy 24, r 24 en un viewBox 0 0 48 48).
export const MINIMAL_AVATARS = [
    { id: 'clay-disc', bg: '#C26446', mark: (c) => <circle cx="24" cy="24" r="8.5" fill={c} /> },
    { id: 'sage-ring', bg: '#7E9B76', mark: (c) => <circle cx="24" cy="24" r="8.5" fill="none" stroke={c} strokeWidth="3.5" /> },
    { id: 'slate-half', bg: '#5E6E7E', mark: (c) => <path d="M24 15.5a8.5 8.5 0 0 0 0 17z" fill={c} /> },
    { id: 'amber-moon', bg: '#B98A45', mark: (c, bg) => (<g><circle cx="24" cy="24" r="9" fill={c} /><circle cx="27.6" cy="21.6" r="8" fill={bg} /></g>) },
    { id: 'plum-arc', bg: '#8A6B8C', mark: (c) => <path d="M15 27a9 9 0 0 1 18 0" fill="none" stroke={c} strokeWidth="3.5" strokeLinecap="round" /> },
    { id: 'teal-tri', bg: '#5F8B86', mark: (c) => <path d="M24 16l8 15H16z" fill={c} /> },
    { id: 'rust-dots', bg: '#A6584F', mark: (c) => (<g fill={c}><circle cx="16" cy="24" r="3" /><circle cx="24" cy="24" r="3" /><circle cx="32" cy="24" r="3" /></g>) },
    { id: 'dusty-tri', bg: '#74879E', mark: (c) => <path d="M14 34L34 14v20z" fill={c} /> },
    { id: 'sand-plus', bg: '#9A7A50', mark: (c) => (<g fill={c}><rect x="21.5" y="15" width="5" height="18" rx="2.5" /><rect x="15" y="21.5" width="18" height="5" rx="2.5" /></g>) },
    { id: 'moss-target', bg: '#6F8C66', mark: (c) => (<g><circle cx="24" cy="24" r="9" fill="none" stroke={c} strokeWidth="2.5" /><circle cx="24" cy="24" r="3.5" fill={c} /></g>) },
    { id: 'rose-bars', bg: '#B0786C', mark: (c) => (<g fill={c}><rect x="15" y="19.5" width="18" height="3.6" rx="1.8" /><rect x="15" y="25.5" width="18" height="3.6" rx="1.8" /></g>) },
    { id: 'steel-pie', bg: '#5F7689', mark: (c) => <path d="M24 24V15a9 9 0 0 1 9 9z" fill={c} /> },
];

const BY_ID = Object.fromEntries(MINIMAL_AVATARS.map((a) => [a.id, a]));

export function getAvatarById(id) {
    return BY_ID[id] || null;
}

export function MinimalAvatar({ id, size = 48, className, style }) {
    const a = BY_ID[id];
    if (!a) return null;
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 48 48"
            className={className}
            style={{ display: 'block', ...style }}
            aria-hidden="true"
        >
            <circle cx="24" cy="24" r="24" fill={a.bg} />
            {a.mark(CREAM, a.bg)}
        </svg>
    );
}
