import { useId } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * [P3-BOT-AVATAR-3D · 2026-06-19 · v2] Avatar del agente como ORBE 3D glossy.
 *   - Esfera con sombreado radial (3D) + brillo glossy + sombra de contacto.
 *   - Ojos NÍTIDOS de alto contraste: blancos amplios + pupilas oscuras crujientes
 *     + catchlight (puntito blanco) que les da vida y definición.
 *   - Antena con punta teal (acento de marca).
 *   - `thinking`: animación "pensando" (antena con glow pulsante + pupilas que miran
 *     alrededor + cabeceo suave). `float`: bob sutil para el avatar grande de bienvenida.
 * Respeta prefers-reduced-motion. `useId` → gradientes únicos por instancia.
 */
export default function BotAvatar({ size = 36, float = false, thinking = false, style, className }) {
    const reduce = useReducedMotion();
    const uid = useId().replace(/[:]/g, '');
    const gSphere = `bsph-${uid}`;
    const gGloss = `bgl-${uid}`;
    const gShade = `bsh-${uid}`;
    const anim = !reduce;
    const doThink = thinking && anim;
    const doFloat = float && anim && !doThink;

    const eyeAnim = doThink ? { animation: 'botPupilLook 3s ease-in-out infinite' } : undefined;
    const antGlowAnim = doThink ? { animation: 'botAntGlow 1.3s ease-in-out infinite' } : undefined;
    const svgAnim = doThink
        ? { animation: 'botOrbThink 2.6s ease-in-out infinite', transformOrigin: 'center' }
        : doFloat
            ? { animation: 'botOrbFloat 3.2s ease-in-out infinite' }
            : undefined;

    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 48 48"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            style={{ display: 'block', overflow: 'visible', ...svgAnim, ...style }}
            aria-hidden="true"
        >
            {(doThink || doFloat) && (
                <style>{
                    '@keyframes botOrbFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-2.5px)}}'
                    + '@keyframes botOrbThink{0%,100%{transform:translateY(0) rotate(0deg)}25%{transform:translateY(-1.6px) rotate(-3.5deg)}75%{transform:translateY(-1.6px) rotate(3.5deg)}}'
                    + '@keyframes botAntGlow{0%,100%{opacity:.3}50%{opacity:.78}}'
                    + '@keyframes botPupilLook{0%,18%{transform:translate(0,0)}30%,44%{transform:translate(-1.5px,-.4px)}56%,70%{transform:translate(1.5px,-.2px)}82%,100%{transform:translate(0,.5px)}}'
                }</style>
            )}
            <defs>
                <radialGradient id={gSphere} cx="38%" cy="30%" r="80%">
                    <stop offset="0%" stopColor="#C7D2FE" />
                    <stop offset="42%" stopColor="#6366F1" />
                    <stop offset="100%" stopColor="#3730A3" />
                </radialGradient>
                <radialGradient id={gGloss} cx="34%" cy="26%" r="42%">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="0.92" />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                </radialGradient>
                <radialGradient id={gShade} cx="50%" cy="82%" r="60%">
                    <stop offset="0%" stopColor="#140e3c" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="#140e3c" stopOpacity="0" />
                </radialGradient>
            </defs>

            {/* sombra de contacto */}
            <ellipse cx="24" cy="45.5" rx="12" ry="2.3" fill="#000" opacity="0.22" />

            {/* antena: tallo + glow (pulsa al pensar) + punta teal */}
            <line x1="24" y1="3.2" x2="24" y2="6.8" stroke="#C7D2FE" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="24" cy="2.4" r="3.6" fill="#5EEAD4" opacity="0.3" style={antGlowAnim} />
            <circle cx="24" cy="2.4" r="1.85" fill="#5EEAD4" />

            {/* esfera 3D */}
            <circle cx="24" cy="24" r="18" fill={`url(#${gSphere})`} />
            <circle cx="24" cy="24" r="18" fill={`url(#${gShade})`} />

            {/* brillo glossy */}
            <ellipse cx="18" cy="16" rx="8" ry="6" fill={`url(#${gGloss})`} />

            {/* OJOS — blancos amplios + pupilas oscuras nítidas + catchlight.
                Al pensar, el grupo de pupilas mira alrededor. */}
            <circle cx="18.5" cy="25" r="3.8" fill="#fff" />
            <circle cx="29.5" cy="25" r="3.8" fill="#fff" />
            <g style={eyeAnim}>
                <circle cx="18.5" cy="25.1" r="1.95" fill="#1e1b4b" />
                <circle cx="29.5" cy="25.1" r="1.95" fill="#1e1b4b" />
                <circle cx="17.65" cy="24.2" r="0.72" fill="#fff" />
                <circle cx="28.65" cy="24.2" r="0.72" fill="#fff" />
            </g>

            {/* sonrisa */}
            <path d="M20.5 30.8 Q24 33.4 27.5 30.8" stroke="#fff" strokeOpacity="0.9" strokeWidth="1.7" strokeLinecap="round" fill="none" />
        </svg>
    );
}
