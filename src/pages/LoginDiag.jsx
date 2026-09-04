// [DIAG-LOGIN-BAND · 2026-09-04 · TEMPORAL] Sonda para la franja de otro tono al pie del login
// en iPhone que ni html/body ni theme-color quitaron. Solo se monta con `#diag` en la URL.
// Pinta html en magenta, body en cian, el borde inferior del login en rojo y el del form en
// amarillo, y muestra las medidas del viewport: con UNA captura se ve de quién es la franja.
import { useEffect, useState } from 'react';

const round = (v) => (typeof v === 'number' ? Math.round(v) : '?');

export default function LoginDiag() {
    const [info, setInfo] = useState('');
    useEffect(() => {
        document.documentElement.style.background = '#ff00ff';
        document.body.style.background = '#00ffff';
        const read = () => {
            const login = document.querySelector('.mf-login');
            const form = document.querySelector('.mf-form');
            if (login) login.style.boxShadow = 'inset 0 -4px 0 #ff0000';
            if (form) form.style.boxShadow = 'inset 0 -4px 0 #ffff00';
            const r = login?.getBoundingClientRect();
            const fr = form?.getBoundingClientRect();
            const probe = document.getElementById('mf-diag-probe');
            const sab = probe ? getComputedStyle(probe).paddingBottom : '?';
            const vv = window.visualViewport;
            setInfo([
                `inner ${window.innerWidth}x${window.innerHeight}  screen ${window.screen.width}x${window.screen.height}`,
                `visualViewport h ${round(vv?.height)} top ${round(vv?.offsetTop)}`,
                `html ${document.documentElement.clientHeight}  body ${document.body.clientHeight}`,
                `login ${round(r?.top)}..${round(r?.bottom)} (h ${round(r?.height)}, scrollH ${login?.scrollHeight})`,
                `form ${round(fr?.top)}..${round(fr?.bottom)} (h ${round(fr?.height)})`,
                `safe-bottom ${sab}  standalone ${String(window.navigator.standalone)} / ${window.matchMedia('(display-mode: standalone)').matches}`,
                `ua …${navigator.userAgent.slice(-70)}`,
            ].join(String.fromCharCode(10)));
        };
        read();
        const id = setInterval(read, 1000);
        return () => clearInterval(id);
    }, []);
    return (
        <>
            <div id="mf-diag-probe" aria-hidden="true" style={{ position: 'fixed', left: 0, top: 0, width: 0, height: 0, opacity: 0, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }} />
            <pre style={{ position: 'fixed', left: 8, right: 8, top: '36%', zIndex: 99, margin: 0, padding: 8, font: '11px/1.35 ui-monospace, monospace', color: '#fff', background: 'rgba(180, 0, 0, 0.8)', borderRadius: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{info}</pre>
        </>
    );
}
