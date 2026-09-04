// [P3-AVATAR-PICKER · 2026-06-20] Avatar minimalista: disco de color + marca geométrica en crema.
// El catálogo (`MINIMAL_AVATARS`) vive en ./avatarCatalog.jsx.
import { MINIMAL_AVATARS } from './avatarCatalog';

const CREAM = '#F4EEE3';
const BY_ID = Object.fromEntries(MINIMAL_AVATARS.map((a) => [a.id, a]));

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
