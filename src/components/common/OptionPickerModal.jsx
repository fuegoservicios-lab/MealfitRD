import { useState } from 'react';
import PropTypes from 'prop-types';
import { Loader2 } from 'lucide-react';
import Modal from './Modal';
import { isDarkActive } from '../../utils/theme';

const OptionPickerModal = ({
    isOpen,
    onClose,
    title,
    subtitle,
    headerIcon,
    options,
    isNavigatingOption,
    onOptionClick,
    infoBandRenderer,
    isBottomSheetOnMobile = true,
    maxWidth = '440px'
}) => {
    // [FIX 2026-05-07] Dos estados separados resuelven el flicker en el
    // borde de los botones:
    //   - `activeOption`: hover visual (border/sombra). Transitorio: sigue
    //     al cursor en tiempo real.
    //   - `pinnedInfoOption`: contenido del infoBand. Persistente: solo
    //     cambia cuando el usuario explícitamente explora otra opción.
    //
    // Antes había UN solo estado para ambos. Cuando el cursor cruzaba el
    // gap entre botones, el `onMouseLeave` lo reseteaba a null → el
    // infoBand cambiaba de altura → modal recentraba → el botón se movía
    // bajo el cursor → loop de enter/leave/enter/leave que hacía parpadear
    // la descripción.
    //
    // Separando los conceptos, el estado visual puede oscilar libremente
    // sin afectar al infoBand (que ya tiene min-height estable). El
    // infoBand solo cambia con `onMouseEnter` de otra opción — nunca con
    // `onMouseLeave`.
    const [activeOption, setActiveOption] = useState(null);
    const [pinnedInfoOption, setPinnedInfoOption] = useState(null);
    // [APPEARANCE-THEME · 2026-05-29] En oscuro, los `option.bg` pastel claros
    // se ven brillosos → derivamos un tinte translúcido del color del option.
    const isDark = isDarkActive();

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            titleId="option-picker-modal-title"
            maxWidth={maxWidth}
            isBottomSheetOnMobile={isBottomSheetOnMobile}
            disableClose={!!isNavigatingOption}
        >
            {/* Header */}
            {headerIcon ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div style={{ background: headerIcon.bg || '#DCFCE7', color: headerIcon.color || '#16A34A', padding: '0.75rem', borderRadius: '50%' }}>
                        {headerIcon.icon}
                    </div>
                    <h3 id="option-picker-modal-title" style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)' }}>
                        {title}
                    </h3>
                </div>
            ) : (
                <div style={{ marginBottom: '0.5rem' }}>
                    <h3 id="option-picker-modal-title" style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)', margin: 0, letterSpacing: '-0.02em' }}>
                        {title}
                    </h3>
                </div>
            )}

            {subtitle && (
                <div style={{
                    fontSize: headerIcon ? '0.95rem' : '0.86rem',
                    color: 'var(--text-muted)',
                    margin: headerIcon ? '0 0 2rem 0' : '0 0 1.25rem 0',
                    fontWeight: 500,
                    lineHeight: headerIcon ? 1.6 : 1.4
                }}>
                    {subtitle}
                </div>
            )}

            {/* Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: headerIcon ? '1rem' : '0.6rem' }}>
                {/* Anuncio para Screen Readers cuando un botón está cargando */}
                <div aria-live="polite" style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', border: 0 }}>
                    {isNavigatingOption ? 'Preparando nuevo plan, esto tardará unos segundos' : ''}
                </div>

                {options.map(option => {
                    // `isHovered` controla el estilo visual (border/sombra) — usa
                    // el estado transitorio que sigue al cursor en tiempo real.
                    const isHovered = activeOption === option.id;
                    const isDisabled = !!isNavigatingOption || !!option.disabled;
                    const isLoading = isNavigatingOption === option.id;
                    const isFaded = !!isNavigatingOption && !isLoading;

                    // Color base del option para derivar tintes en oscuro.
                    const _accent = option.color || '#64748B';
                    const cardBg = option.disabled
                        ? 'var(--bg-muted)'
                        : isDark
                            // Tinte translúcido del acento (hex + alpha): ~10% normal, ~18% hover.
                            ? (isHovered && !isDisabled ? `${_accent}24` : `${_accent}1A`)
                            : (isHovered && !isDisabled ? (option.hoverBg || option.bg || 'var(--bg-muted)') : (option.bg || 'var(--bg-muted)'));

                    const cardBorder = option.disabled
                        ? 'var(--border)'
                        : isDark
                            ? (isHovered && !isDisabled ? _accent : `${_accent}40`)
                            : (isHovered && !isDisabled
                                ? (headerIcon ? (option.hoverBorder || option.color || '#3B82F6') : (option.color || option.border || 'var(--border)'))
                                : (option.border || 'var(--border)'));

                    // [APPEARANCE-THEME · 2026-05-29] En oscuro el glow usaba
                    // `option.border` (pastel claro) a ~50% alpha → se veía muy
                    // brilloso. Sombra negra contenida en su lugar.
                    const cardShadow = !option.disabled && isHovered && !isDisabled
                        ? (isDark ? '0 4px 14px rgba(0, 0, 0, 0.4)' : `0 4px 18px ${option.border || '#CBD5E1'}80`)
                        : 'none';

                    return (
                        <button
                            key={option.id}
                            aria-busy={isLoading}
                            aria-disabled={isDisabled}
                            onClick={() => {
                                if (isNavigatingOption || option.disabled) return;
                                if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
                                    navigator.vibrate(10);
                                }
                                onOptionClick(option.id);
                            }}
                            disabled={!!isNavigatingOption}
                            style={{
                                display: 'flex',
                                alignItems: headerIcon ? 'flex-start' : 'center',
                                flexDirection: headerIcon ? 'column' : 'row',
                                gap: headerIcon ? '0' : '0.8rem',
                                width: '100%',
                                minHeight: headerIcon ? 'auto' : '54px',
                                textAlign: 'left',
                                background: cardBg,
                                border: `1.5px solid ${cardBorder}`,
                                borderRadius: headerIcon ? '1rem' : '0.95rem',
                                padding: headerIcon ? '1.25rem' : '0.9rem 1rem',
                                cursor: isDisabled ? 'not-allowed' : 'pointer',
                                transition: 'background 0.1s ease-out, border-color 0.1s ease-out, box-shadow 0.1s ease-out, opacity 0.15s',
                                opacity: option.disabled ? 0.45 : (isFaded ? 0.5 : 1),
                                boxShadow: cardShadow,
                            }}
                            onMouseEnter={() => {
                                if (option.disabled) return;
                                setActiveOption(option.id);       // visual hover (transitorio)
                                setPinnedInfoOption(option.id);   // infoBand (persistente)
                            }}
                            onMouseLeave={() => {
                                // Solo limpia el visual hover. El infoBand queda
                                // pinned a la última opción explorada — no parpadea
                                // aunque el cursor cruce el gap entre botones.
                                setActiveOption(null);
                            }}
                            onFocus={() => {
                                if (option.disabled) return;
                                setActiveOption(option.id);
                                setPinnedInfoOption(option.id);
                            }}
                            onBlur={() => {
                                setActiveOption(null);
                            }}
                        >
                            {!headerIcon && option.icon && (
                                <div style={{
                                    width: '42px',
                                    height: '42px',
                                    borderRadius: '0.75rem',
                                    background: option.disabled ? 'var(--bg-muted)' : `${option.color}18`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                    transition: 'background 0.18s',
                                }}>
                                    <option.icon size={20} color={option.disabled ? 'var(--text-light)' : option.color} />
                                </div>
                            )}

                            <div style={{ flex: 1, width: '100%' }}>
                                <div style={{
                                    fontSize: headerIcon ? '1.05rem' : '0.95rem',
                                    fontWeight: 700,
                                    color: option.disabled ? 'var(--text-light)' : (option.labelColor || (headerIcon ? (isDark ? 'var(--text-main)' : '#1E3A8A') : 'var(--text-main)')),
                                    letterSpacing: '-0.015em',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    marginBottom: headerIcon ? '0.25rem' : '1px',
                                    lineHeight: 1.3,
                                }}>
                                    {option.label}
                                    {isLoading && (
                                        <Loader2 className="spin-fast" size={headerIcon ? 16 : 14} color={headerIcon ? 'currentColor' : option.color} />
                                    )}
                                </div>
                                <div style={{
                                    fontSize: headerIcon ? '0.85rem' : '0.81rem',
                                    color: option.disabled ? 'var(--text-light)' : 'var(--text-muted)',
                                    fontWeight: 500,
                                    lineHeight: 1.35,
                                }}>
                                    {isLoading ? 'Preparando...' : (option.disabled ? (option.disabledDesc || option.desc) : option.desc)}
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Informational Band — usa el estado pinned (no transitorio)
                para que la descripción NO desaparezca cuando el cursor sale
                del botón. Solo cambia cuando el usuario hovea otra opción. */}
            {infoBandRenderer && infoBandRenderer(pinnedInfoOption)}
        </Modal>
    );
};

OptionPickerModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    title: PropTypes.node.isRequired,
    subtitle: PropTypes.node,
    headerIcon: PropTypes.shape({
        icon: PropTypes.node.isRequired,
        bg: PropTypes.string,
        color: PropTypes.string
    }),
    options: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string.isRequired,
        icon: PropTypes.elementType,
        label: PropTypes.string.isRequired,
        color: PropTypes.string,
        bg: PropTypes.string,
        border: PropTypes.string,
        hoverBg: PropTypes.string,
        hoverBorder: PropTypes.string,
        desc: PropTypes.string.isRequired,
        disabled: PropTypes.bool,
        disabledDesc: PropTypes.string
    })).isRequired,
    isNavigatingOption: PropTypes.string,
    onOptionClick: PropTypes.func.isRequired,
    infoBandRenderer: PropTypes.func,
    isBottomSheetOnMobile: PropTypes.bool,
    maxWidth: PropTypes.string
};

export default OptionPickerModal;
