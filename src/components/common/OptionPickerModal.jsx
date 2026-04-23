import { useState, useRef } from 'react';
import PropTypes from 'prop-types';
import { Loader2 } from 'lucide-react';
import Modal from './Modal';

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
    const [hoveredOption, setHoveredOption] = useState(null);
    const hoverClearTimer = useRef(null);

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
                    <h3 id="option-picker-modal-title" style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0F172A' }}>
                        {title}
                    </h3>
                </div>
            ) : (
                <div style={{ marginBottom: '0.5rem' }}>
                    <h3 id="option-picker-modal-title" style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', margin: 0, letterSpacing: '-0.02em' }}>
                        {title}
                    </h3>
                </div>
            )}

            {subtitle && (
                <div style={{
                    fontSize: headerIcon ? '0.95rem' : '0.86rem',
                    color: '#64748B',
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
                    const isHovered = hoveredOption === option.id;
                    const isDisabled = !!isNavigatingOption || !!option.disabled;
                    const isLoading = isNavigatingOption === option.id;
                    const isFaded = !!isNavigatingOption && !isLoading;

                    const cardBg = option.disabled
                        ? '#F8FAFC'
                        : (isHovered && !isDisabled ? (option.hoverBg || option.bg || '#F8FAFC') : (option.bg || '#F8FAFC'));

                    const cardBorder = option.disabled
                        ? '#E2E8F0'
                        : (isHovered && !isDisabled
                            ? (headerIcon ? (option.hoverBorder || option.color || '#3B82F6') : (option.color || option.border || '#E2E8F0'))
                            : (option.border || '#E2E8F0'));

                    const cardShadow = !option.disabled && isHovered && !isDisabled
                        ? `0 4px 18px ${option.border || '#CBD5E1'}80`
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
                                transition: 'background 0.18s, border-color 0.18s, box-shadow 0.18s, opacity 0.15s',
                                opacity: option.disabled ? 0.45 : (isFaded ? 0.5 : 1),
                                boxShadow: cardShadow,
                            }}
                            onMouseEnter={() => {
                                clearTimeout(hoverClearTimer.current);
                                if (!option.disabled) setHoveredOption(option.id);
                            }}
                            onMouseLeave={() => {
                                hoverClearTimer.current = setTimeout(() => setHoveredOption(null), 80);
                            }}
                        >
                            {!headerIcon && option.icon && (
                                <div style={{
                                    width: '42px',
                                    height: '42px',
                                    borderRadius: '0.75rem',
                                    background: option.disabled ? '#E2E8F0' : `${option.color}18`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                    transition: 'background 0.18s',
                                }}>
                                    <option.icon size={20} color={option.disabled ? '#94A3B8' : option.color} />
                                </div>
                            )}

                            <div style={{ flex: 1, width: '100%' }}>
                                <div style={{
                                    fontSize: headerIcon ? '1.05rem' : '0.95rem',
                                    fontWeight: 700,
                                    color: option.disabled ? '#94A3B8' : (option.labelColor || (headerIcon ? '#1E3A8A' : '#0F172A')),
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
                                    color: option.disabled ? '#94A3B8' : '#64748B',
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

            {/* Informational Band */}
            {infoBandRenderer && infoBandRenderer(hoveredOption)}
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
