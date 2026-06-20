// [P3-AVATAR-PICKER · 2026-06-20] Modal para elegir un avatar minimalista (o la
// inicial). Self-contained: overlay + grid; ESC y click-fuera cierran. La
// persistencia la maneja el caller (onSelect recibe el id o null = inicial).
import { useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { MINIMAL_AVATARS, MinimalAvatar } from './minimalAvatars';
import styles from './AvatarPicker.module.css';

export default function AvatarPicker({ open, current = null, userInitial = 'U', onSelect, onClose }) {
    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div
            className={styles.overlay}
            role="dialog"
            aria-modal="true"
            aria-label="Elegir avatar"
            onClick={onClose}
        >
            <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
                <div className={styles.head}>
                    <h3 className={styles.title}>Elige tu avatar</h3>
                    <button type="button" className={styles.close} onClick={onClose} aria-label="Cerrar">
                        <X size={18} />
                    </button>
                </div>
                <p className={styles.hint}>Minimalistas — o quédate con tu inicial.</p>

                <div className={styles.grid}>
                    <button
                        type="button"
                        className={`${styles.opt} ${current == null ? styles.optActive : ''}`}
                        onClick={() => onSelect(null)}
                        aria-label="Usar mi inicial"
                    >
                        <span className={styles.letter}>{userInitial}</span>
                        {current == null && <span className={styles.tick}><Check size={12} strokeWidth={3} /></span>}
                    </button>

                    {MINIMAL_AVATARS.map((a) => (
                        <button
                            key={a.id}
                            type="button"
                            className={`${styles.opt} ${current === a.id ? styles.optActive : ''}`}
                            onClick={() => onSelect(a.id)}
                            aria-label={`Avatar ${a.id}`}
                        >
                            <MinimalAvatar id={a.id} size={58} style={{ borderRadius: '50%' }} />
                            {current === a.id && <span className={styles.tick}><Check size={12} strokeWidth={3} /></span>}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
