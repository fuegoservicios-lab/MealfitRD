import { useState, useEffect } from 'react';
import { Share, X } from 'lucide-react';

const IOSInstallPrompt = () => {
    const [showPrompt, setShowPrompt] = useState(false);

    useEffect(() => {
        // Detect IOS
        const userAgent = window.navigator.userAgent.toLowerCase();
        const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
        
        // Detect Standalone (installed)
        const isStandaloneMode = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;

        // Check if user previously dismissed
        const hasDismissed = localStorage.getItem('dismissed_ios_prompt');

        if (isIOSDevice && !isStandaloneMode && !hasDismissed) {
            // Show after a small delay
            const timer = setTimeout(() => {
                setShowPrompt(true);
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, []);

    const dismissPrompt = () => {
        setShowPrompt(false);
        localStorage.setItem('dismissed_ios_prompt', 'true');
    };

    if (!showPrompt) return null;

    return (
        <div style={{
            position: 'fixed',
            bottom: 'max(env(safe-area-inset-bottom, 20px), 20px)',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '90%',
            maxWidth: '400px',
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            padding: '1rem',
            borderRadius: '16px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            border: '1px solid rgba(0,0,0,0.05)',
            transition: 'transform 0.3s ease-out, opacity 0.3s ease-out'
        }}>
            <button onClick={dismissPrompt} style={{
                position: 'absolute', top: '8px', right: '8px',
                background: 'none', border: 'none', color: '#64748b',
                padding: '4px', cursor: 'pointer', zIndex: 10
            }}>
                <X size={18} />
            </button>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <img src="/favicon.png" alt="Mealfit" style={{ width: 44, height: 44, borderRadius: '10px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }} />
                <div>
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>Instalar App</h4>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#475569', lineHeight: 1.2 }}>Acceso directo a tus planes y chat IA.</p>
                </div>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', color: '#334155', background: '#f8fafc', padding: '0.75rem', borderRadius: '8px', marginTop: '0.25rem', border: '1px solid #e2e8f0' }}>
                <span>1. Toca</span> <Share size={18} color="#007aff" />
                <span>y luego <strong>"Agregar a inicio"</strong></span>
            </div>
            <style>{`
                @keyframes slidePrompt {
                    from { transform: translate(-50%, 100%); opacity: 0; }
                    to { transform: translate(-50%, 0); opacity: 1; }
                }
            `}</style>
        </div>
    );
};

export default IOSInstallPrompt;
