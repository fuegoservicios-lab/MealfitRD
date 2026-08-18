// [P2-COUNTRY-FLAG-ICONS · 2026-08-18] Banderas SVG inline para el selector de
// país (QCountry) — reemplazan el planeta genérico (Globe2) por la bandera de
// cada país, recortada en círculo para llenar el iconChip de 52px de RadioCard.
//
// Decisiones:
// - SVG inline propio, CERO dependencias nuevas (la dieta de `lucide` sigue:
//   ver backend/docs/landing_apex_antipatterns.md — no se añade una librería de
//   banderas por 6 países).
// - NO emoji de bandera: en Windows los emoji de bandera renderizan como el par
//   de letras ("DO", "ES"), no como bandera.
// - Paleta armonizada (rojo/azul/amarillo compartidos) en vez de los tonos
//   oficiales exactos de cada país — el conjunto se ve cohesionado en la UI
//   oscura, mismo criterio que la librería circle-flags.
// - `width/height="100%"`: la bandera LLENA el chip circular (tapa el fondo
//   muted/primary del chip). RadioCard pasa `size`/`strokeWidth` pensados para
//   lucide; aquí se ignoran a propósito — una bandera no tiene stroke.
// - México lleva un roundel dorado como abstracción del escudo: sin él, el
//   tricolor vertical verde-blanco-rojo es indistinguible de Italia.
// - `aria-hidden`: decorativas — el nombre del país ya lo da el label de la
//   tarjeta.
// - Los `clipPath` llevan id fijo por bandera (cada una se monta una vez por
//   página; si algún día se montan dos instancias de la MISMA bandera, el clip
//   duplicado es idéntico e inofensivo).
import PropTypes from 'prop-types';

const RED = '#d80027';
const BLUE = '#0052b4';
const YELLOW = '#ffda44';
const WHITE = '#f0f0f0';

const FlagSvg = ({ clipId, className, children }) => (
    <svg
        viewBox="0 0 48 48"
        width="100%"
        height="100%"
        className={className}
        aria-hidden="true"
        focusable="false"
    >
        <defs>
            <clipPath id={clipId}>
                <circle cx="24" cy="24" r="24" />
            </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>{children}</g>
    </svg>
);

FlagSvg.propTypes = {
    clipId: PropTypes.string.isRequired,
    className: PropTypes.string,
    children: PropTypes.node.isRequired,
};

// República Dominicana: cruz blanca, cuartos azul/rojo (arriba-izq azul,
// arriba-der rojo, abajo-izq rojo, abajo-der azul). Sin escudo: ilegible a 52px.
export const FlagDO = ({ className }) => (
    <FlagSvg clipId="bbflag-do" className={className}>
        <rect width="48" height="48" fill={WHITE} />
        <rect x="0" y="0" width="19" height="19" fill={BLUE} />
        <rect x="29" y="0" width="19" height="19" fill={RED} />
        <rect x="0" y="29" width="19" height="19" fill={RED} />
        <rect x="29" y="29" width="19" height="19" fill={BLUE} />
    </FlagSvg>
);

// España: rojo-amarillo-rojo 1:2:1 (versión civil, sin escudo).
export const FlagES = ({ className }) => (
    <FlagSvg clipId="bbflag-es" className={className}>
        <rect width="48" height="48" fill={RED} />
        <rect x="0" y="12" width="48" height="24" fill={YELLOW} />
    </FlagSvg>
);

// Estados Unidos: 13 franjas + cantón azul con sugerencia de estrellas
// (50 estrellas reales son ilegibles a este tamaño).
export const FlagUS = ({ className }) => (
    <FlagSvg clipId="bbflag-us" className={className}>
        <rect width="48" height="48" fill={WHITE} />
        {[0, 7.38, 14.77, 22.15, 29.54, 36.92, 44.31].map((y) => (
            <rect key={y} x="0" y={y} width="48" height="3.7" fill={RED} />
        ))}
        <rect x="0" y="0" width="21" height="25.8" fill={BLUE} />
        {[4.3, 12.9, 21.5].map((cy) =>
            [4.2, 10.5, 16.8].map((cx) => (
                <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.5" fill={WHITE} />
            ))
        )}
    </FlagSvg>
);

// México: tricolor vertical + roundel dorado (abstracción del escudo — sin él
// sería la bandera de Italia).
export const FlagMX = ({ className }) => (
    <FlagSvg clipId="bbflag-mx" className={className}>
        <rect x="0" y="0" width="16" height="48" fill="#6da544" />
        <rect x="16" y="0" width="16" height="48" fill={WHITE} />
        <rect x="32" y="0" width="16" height="48" fill={RED} />
        <circle cx="24" cy="24" r="4.6" fill="#a2793d" />
        <circle cx="24" cy="24" r="1.9" fill="#7b5b2e" />
    </FlagSvg>
);

// Puerto Rico: 5 franjas rojas/blancas + triángulo azul con estrella blanca
// centrada en el incentro del triángulo.
export const FlagPR = ({ className }) => (
    <FlagSvg clipId="bbflag-pr" className={className}>
        <rect width="48" height="48" fill={WHITE} />
        {[0, 19.2, 38.4].map((y) => (
            <rect key={y} x="0" y={y} width="48" height="9.6" fill={RED} />
        ))}
        <path d="M0 0 L24 24 L0 48 Z" fill={BLUE} />
        <path
            d="M9.5 19 L10.73 22.3 L14.26 22.45 L11.5 24.65 L12.44 28.05 L9.5 26.1 L6.56 28.05 L7.5 24.65 L4.74 22.45 L8.27 22.3 Z"
            fill={WHITE}
        />
    </FlagSvg>
);

// Colombia: amarillo (mitad superior), azul y rojo (un cuarto cada uno).
export const FlagCO = ({ className }) => (
    <FlagSvg clipId="bbflag-co" className={className}>
        <rect x="0" y="0" width="48" height="24" fill={YELLOW} />
        <rect x="0" y="24" width="48" height="12" fill={BLUE} />
        <rect x="0" y="36" width="48" height="12" fill={RED} />
    </FlagSvg>
);

const flagPropTypes = { className: PropTypes.string };
FlagDO.propTypes = flagPropTypes;
FlagES.propTypes = flagPropTypes;
FlagUS.propTypes = flagPropTypes;
FlagMX.propTypes = flagPropTypes;
FlagPR.propTypes = flagPropTypes;
FlagCO.propTypes = flagPropTypes;

// Registro por código ISO — el consumidor hace `COUNTRY_FLAGS[code] || Globe2`
// para que un país futuro sin bandera dibujada degrade al planeta, no a un hueco.
// El disable es el precedente de AssessmentContext.jsx:4262 — este archivo no
// tiene estado hot-reloadable, perder fast-refresh aquí no cuesta nada.
// eslint-disable-next-line react-refresh/only-export-components
export const COUNTRY_FLAGS = {
    DO: FlagDO,
    ES: FlagES,
    US: FlagUS,
    MX: FlagMX,
    PR: FlagPR,
    CO: FlagCO,
};
