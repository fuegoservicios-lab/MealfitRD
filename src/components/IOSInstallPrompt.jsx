import { useState, useEffect } from 'react';
import { Share, X } from 'lucide-react';
// [P1-PROD-FINAL-3 · 2026-05-24] safeLocalStorage SSOT — irónicamente este
// componente solo se muestra en iOS, donde Private Mode hace crash con raw
// setItem.
import { safeLocalStorageGet, safeLocalStorageSet } from '../utils/safeLocalStorage';

const IOSInstallPrompt = () => {
    const [showPrompt, setShowPrompt] = useState(false);

    useEffect(() => {
        // Detect IOS
        const userAgent = window.navigator.userAgent.toLowerCase();
        const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
        
        // Detect Standalone (installed)
        const isStandaloneMode = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;

        // Check if user previously dismissed
        const hasDismissed = safeLocalStorageGet('dismissed_ios_prompt', null);

        if (isIOSDevice && !isStandaloneMode && !hasDismissed) {
            // [LOGIN-INSTALL-DISCRETO · 2026-06-30] Aparece tras una espera más larga
            // (12s) para no interrumpir al entrar; antes saltaba a los 3s.
            const timer = setTimeout(() => {
                setShowPrompt(true);
            }, 12000);
            return () => clearTimeout(timer);
        }
    }, []);

    const dismissPrompt = () => {
        setShowPrompt(false);
        safeLocalStorageSet('dismissed_ios_prompt', 'true');
    };

    if (!showPrompt) return null;

    return (
        <div style={{
            position: 'fixed',
            bottom: 'max(env(safe-area-inset-bottom, 14px), 14px)',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '92%',
            maxWidth: '340px',
            backgroundColor: 'var(--bg-card)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            padding: '0.7rem 0.85rem',
            borderRadius: '14px',
            boxShadow: '0 12px 30px -12px rgba(0,0,0,0.45)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            border: '1px solid var(--border)',
            animation: 'slidePrompt 0.35s ease-out'
        }}>
            <img src="/favicon.png" alt="Mealfit" style={{ width: 34, height: 34, borderRadius: '9px', flexShrink: 0 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ margin: 0, fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-main)', lineHeight: 1.25 }}>
                    Instala MealfitRD
                </p>
                <p style={{ margin: '2px 0 0', fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: 1.3, display: 'flex', alignItems: 'center', gap: '0.28rem', flexWrap: 'wrap' }}>
                    Toca <Share size={14} color="#007aff" style={{ flexShrink: 0 }} /> y
                    <strong style={{ color: 'var(--text-main)', fontWeight: 600 }}>«Agregar a inicio»</strong>
                </p>
            </div>
            {/* [P2-A11Y-LOGGING · 2026-05-13] aria-label requerido: icon-only button (X)
                sin texto visible necesita label para lectores de pantalla. */}
            <button onClick={dismissPrompt} aria-label="Cerrar aviso de instalación" style={{
                background: 'none', border: 'none', color: 'var(--text-muted)',
                padding: '4px', margin: '-4px -2px -4px 0', cursor: 'pointer', flexShrink: 0,
                alignSelf: 'flex-start'
            }}>
                <X size={16} />
            </button>
            <style>{`
                @keyframes slidePrompt {
                    from { transform: translate(-50%, calc(100% + 14px)); opacity: 0; }
                    to { transform: translate(-50%, 0); opacity: 1; }
                }
            `}</style>
        </div>
    );
};

export default IOSInstallPrompt;
