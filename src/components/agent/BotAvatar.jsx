import { useId } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * [COACH-EMBLEMA · 2026-11-13] El emblema del coach: un anillo abierto que se cierra sobre sí mismo (el «boros» de
 * Bioboros), dentro de un disco sobrio. Sustituye al robot de ojos saltones (P3-BOT-AVATAR-3D), que el dueño vio
 * denigrante para un coach clínico: una cara de juguete al lado de cifras de salud.
 *
 *   - reposo: el anillo quieto.
 *   - `float` (bienvenida): gira muy despacio, como respirando.
 *   - `thinking` (el coach trabaja): el anillo gira y su cabeza brilla; un halo late detrás.
 *
 * Colores por tokens del tema (`--primary`, `--secondary`): se ve bien en claro y en oscuro sin tocar nada.
 * Respeta prefers-reduced-motion. La API (`size`, `float`, `thinking`, `style`, `className`) no cambió.
 */
export default function BotAvatar({ size = 36, float = false, thinking = false, style, className }) {
    const reduce = useReducedMotion();
    const uid = useId().replace(/[:]/g, '');
    const gAro = `cmk-aro-${uid}`;
    const anim = !reduce;
    const doThink = thinking && anim;
    const doFloat = float && anim && !doThink;

    const giro = doThink
        ? { animation: 'coachAroGira 1.5s cubic-bezier(.6,.15,.4,.85) infinite', transformOrigin: '24px 24px' }
        : doFloat
            ? { animation: 'coachAroGira 16s linear infinite', transformOrigin: '24px 24px' }
            : { transformOrigin: '24px 24px', transform: 'rotate(-28deg)' };

    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 48 48"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            style={{ display: 'block', overflow: 'visible', ...style }}
            aria-hidden="true"
        >
            {(doThink || doFloat) && (
                <style>{
                    '@keyframes coachAroGira{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}'
                    + '@keyframes coachHaloLate{0%,100%{opacity:.0;transform:scale(.86)}50%{opacity:.38;transform:scale(1.08)}}'
                    + '@keyframes coachCabezaBrilla{0%,100%{opacity:.55}50%{opacity:1}}'
                }</style>
            )}
            <defs>
                <linearGradient id={gAro} x1="10" y1="12" x2="38" y2="38" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" style={{ stopColor: 'var(--primary-light, #818CF8)' }} />
                    <stop offset="55%" style={{ stopColor: 'var(--primary, #4F46E5)' }} />
                    <stop offset="100%" style={{ stopColor: 'var(--secondary, #10B981)' }} />
                </linearGradient>
            </defs>

            {/* halo: solo late mientras piensa */}
            {doThink && (
                <circle cx="24" cy="24" r="23" style={{
                    fill: 'var(--primary, #4F46E5)', transformOrigin: '24px 24px',
                    animation: 'coachHaloLate 2.2s ease-in-out infinite',
                }} />
            )}

            {/* disco */}
            <circle cx="24" cy="24" r="22" style={{
                fill: 'color-mix(in srgb, var(--primary, #4F46E5) 9%, var(--bg-card, #fff))',
                stroke: 'color-mix(in srgb, var(--primary, #4F46E5) 26%, transparent)',
            }} strokeWidth="1" />

            {/* anillo abierto + cabeza */}
            <g style={giro}>
                <circle
                    cx="24" cy="24" r="11.5"
                    stroke={`url(#${gAro})`} strokeWidth="3.6" strokeLinecap="round"
                    strokeDasharray="56 16.3" fill="none"
                />
                <circle cx="35.5" cy="24" r="2.5" style={{
                    fill: 'var(--secondary-light, #34D399)',
                    ...(doThink ? { animation: 'coachCabezaBrilla 1.5s ease-in-out infinite' } : null),
                }} />
            </g>
        </svg>
    );
}
