import { useState } from 'react';
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
                <div style={{ marginBottom: '0.25rem' }}>
                    <h3 id="option-picker-modal-title" style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                        {title}
                    </h3>
                </div>
            )}
            
            {subtitle && (
                <p style={{ fontSize: headerIcon ? '0.95rem' : '0.85rem', color: '#64748B', margin: headerIcon ? '0 0 2rem 0' : '0 0 1.15rem 0', fontWeight: 500, lineHeight: headerIcon ? 1.6 : 'normal' }}>
                    {subtitle}
                </p>
            )}

            {/* Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: headerIcon ? '1rem' : '0.55rem' }}>
                {/* Anuncio para Screen Readers cuando un botón está cargando */}
                <div aria-live="polite" style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', border: 0 }}>
                    {isNavigatingOption ? 'Preparando nuevo plan, esto tardará unos segundos' : ''}
                </div>
                {options.map(option => (
                    <button
                        key={option.id}
                        aria-busy={isNavigatingOption === option.id}
                        onClick={() => {
                            if (isNavigatingOption) return;
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
                            gap: headerIcon ? '0' : '0.75rem',
                            width: '100%', 
                            textAlign: 'left',
                            background: option.bg || '#F8FAFC', 
                            border: `1.5px solid ${option.border || '#E2E8F0'}`,
                            borderRadius: headerIcon ? '1rem' : '0.9rem', 
                            padding: headerIcon ? '1.25rem' : '0.8rem 0.9rem',
                            cursor: isNavigatingOption ? 'not-allowed' : 'pointer', 
                            transition: 'all 0.2s',
                            opacity: isNavigatingOption && isNavigatingOption !== option.id ? 0.5 : 1
                        }}
                        onMouseEnter={e => { 
                            if (isNavigatingOption) return;
                            if (headerIcon) {
                                e.currentTarget.style.borderColor = option.hoverBorder || '#3B82F6'; 
                                e.currentTarget.style.background = option.hoverBg || '#EFF6FF';
                            } else {
                                e.currentTarget.style.transform = 'scale(1.015)'; 
                                e.currentTarget.style.boxShadow = `0 3px 12px ${option.border}60`;
                            }
                            setHoveredOption(option.id);
                        }}
                        onMouseLeave={e => { 
                            if (isNavigatingOption) return;
                            if (headerIcon) {
                                e.currentTarget.style.borderColor = option.border || '#E2E8F0'; 
                                e.currentTarget.style.background = option.bg || '#F8FAFC';
                            } else {
                                e.currentTarget.style.transform = 'scale(1)'; 
                                e.currentTarget.style.boxShadow = 'none';
                            }
                            setHoveredOption(null);
                        }}
                    >
                        {!headerIcon && option.icon && (
                            <div style={{
                                width: '38px', height: '38px', borderRadius: '0.7rem',
                                background: `${option.color}15`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                            }}>
                                <option.icon size={19} color={option.color} />
                            </div>
                        )}
                        <div style={{ flex: 1, width: '100%' }}>
                            <div style={{ 
                                fontSize: headerIcon ? '1.05rem' : '0.92rem', 
                                fontWeight: 700, 
                                color: option.labelColor || (headerIcon ? '#1E3A8A' : '#0F172A'), 
                                letterSpacing: '-0.01em', 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '8px',
                                marginBottom: headerIcon ? '0.25rem' : '0'
                            }}>
                                {option.label}
                                {isNavigatingOption === option.id && (
                                    <Loader2 className="spin-fast" size={headerIcon ? 16 : 14} color={headerIcon ? 'currentColor' : option.color} />
                                )}
                            </div>
                            <div style={{ 
                                fontSize: headerIcon ? '0.85rem' : '0.78rem', 
                                color: '#64748B', 
                                fontWeight: 500, 
                                marginTop: '2px',
                                lineHeight: headerIcon ? 1.4 : 'normal'
                            }}>
                                {isNavigatingOption === option.id ? 'Preparando...' : option.desc}
                            </div>
                        </div>
                    </button>
                ))}
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
        desc: PropTypes.string.isRequired
    })).isRequired,
    isNavigatingOption: PropTypes.string,
    onOptionClick: PropTypes.func.isRequired,
    infoBandRenderer: PropTypes.func,
    isBottomSheetOnMobile: PropTypes.bool,
    maxWidth: PropTypes.string
};

export default OptionPickerModal;
