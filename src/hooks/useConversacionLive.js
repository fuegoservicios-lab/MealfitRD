// [P1-PLAN-LOTE-905 · 2026-09-29] El modo voz con OpenAI GPT-Live-1: su voz y sus oídos, NUESTRO coach como cerebro.
//
// El dueño: «es muy tonto, lento y no entiende lo que le digo» → «¿y si lo pruebo yo y te voy diciendo?». Solo para
// las cuentas que el servidor habilita (`GET /api/chat/live/disponible`), con un tope duro de gasto en el servidor.
//
// El teléfono habla con GPT-Live-1 por WebRTC (audio de ida y vuelta, se deja interrumpir); el SDP pasa por nuestro
// servidor (`POST /api/chat/live/sesion`), que además escucha la sesión y, cuando GPT-Live-1 delega, corre el turno
// del coach de siempre (backend `coach_live.py`). Lo que el coach cambió (ajustes, Nevera) llega por
// `GET /api/chat/live/{id}/novedades` y se aplica con `alNovedad`.
//
// Misma forma que `useConversacionPorVoz` ({ disponible, abierto, estado, oido, dicho, error, pulso, abrir, cerrar,
// tocar, hablar }) para que `ModoVoz` y AgentPage no distingan un modo del otro.
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWithAuth } from '../config/api';
import { i18nKey } from '../i18n';

export const LIVE_SONDEO_MS = 2000;

const MOTIVOS = {
    presupuesto: i18nKey('Se agotó el saldo de la prueba de voz'),
    no_habilitado: i18nKey('La voz en vivo no está disponible'),
};

export function useConversacionLive({ sessionId, locale = 'es-DO', alNovedad } = {}) {
    const [disponible, setDisponible] = useState(false);
    const [estado, setEstado] = useState('cerrado');
    const [oido, setOido] = useState('');
    const [dicho, setDicho] = useState('');
    const [error, setError] = useState(null);
    const [pulso, setPulso] = useState(0);
    const conexionRef = useRef(null);   // { pc, dc, micro, audio, liveId, sondeo, visto }
    const alNovedadRef = useRef(alNovedad);
    const sessionIdRef = useRef(sessionId);
    const localeRef = useRef(locale);
    useEffect(() => { alNovedadRef.current = alNovedad; sessionIdRef.current = sessionId; localeRef.current = locale; });

    useEffect(() => {
        let vivo = true;
        fetchWithAuth('/api/chat/live/disponible')
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => { if (vivo) setDisponible(Boolean(d?.disponible)); })
            .catch(() => {});
        return () => { vivo = false; };
    }, []);

    const soltar = useCallback(() => {
        const c = conexionRef.current;
        conexionRef.current = null;
        if (!c) return;
        clearInterval(c.sondeo);
        try { c.micro?.getTracks().forEach((tr) => tr.stop()); } catch { /* ya parado */ }
        try { c.dc?.close(); } catch { /* ya cerrado */ }
        try { c.pc?.close(); } catch { /* ya cerrado */ }
        try { if (c.audio) { c.audio.srcObject = null; c.audio.remove(); } } catch { /* sin audio */ }
        try { if (navigator.audioSession) navigator.audioSession.type = 'auto'; } catch { /* sin API */ }
    }, []);

    const sondear = useCallback(async () => {
        const c = conexionRef.current;
        if (!c?.liveId) return;
        try {
            const r = await fetchWithAuth(`/api/chat/live/${c.liveId}/novedades?desde=${c.visto}`);
            if (!r.ok) return;
            const d = await r.json();
            for (const n of d.novedades || []) {
                c.visto = Math.max(c.visto, n.n);
                try { alNovedadRef.current?.(n); } catch { /* una novedad rota no para las demás */ }
            }
            if (d.cerrada && conexionRef.current === c) { soltar(); setEstado('cerrado'); }
        } catch { /* sin red: el próximo sondeo */ }
    }, [soltar]);

    const alEvento = useCallback((ev) => {
        const tipo = ev?.type || '';
        const texto = typeof ev?.delta === 'string' ? ev.delta : (typeof ev?.text === 'string' ? ev.text : '');
        if (tipo === 'session.input_transcript.delta') {
            setDicho('');
            setOido((o) => `${o}${texto}`.slice(-400));
            setEstado('escuchando');
        } else if (tipo === 'session.delegation.created') {
            setEstado('pensando');
        } else if (tipo === 'session.output_transcript.delta') {
            setOido('');
            setDicho((d) => `${d}${texto}`.slice(-400));
            setPulso((p) => p + 1);
            setEstado('hablando');
        } else if (tipo === 'session.closed') {
            sondear();
            soltar();
            setEstado('cerrado');
        } else if (tipo === 'error') {
            // eslint-disable-next-line no-console
            console.error('[P1-PLAN-LOTE-905] GPT-Live', ev);
        }
    }, [soltar, sondear]);

    /** Dentro del toque del usuario: micrófono → oferta WebRTC → nuestro servidor → respuesta de OpenAI. */
    const abrir = useCallback(async () => {
        if (!disponible || conexionRef.current) return;
        setError(null);
        setOido('');
        setDicho('');
        setEstado('pensando');
        const c = { pc: null, dc: null, micro: null, audio: null, liveId: null, sondeo: null, visto: 0 };
        conexionRef.current = c;
        try {
            c.micro = await navigator.mediaDevices.getUserMedia({ audio: true });
            // iOS: una llamada (oír y hablar a la vez) por el altavoz, no bajito por el auricular.
            try { if (navigator.audioSession) navigator.audioSession.type = 'play-and-record'; } catch { /* sin API */ }
            c.pc = new RTCPeerConnection();
            c.audio = document.createElement('audio');
            c.audio.autoplay = true;
            c.audio.setAttribute('playsinline', '');
            document.body.appendChild(c.audio);
            c.pc.ontrack = (e) => { c.audio.srcObject = e.streams[0]; };
            c.micro.getTracks().forEach((tr) => c.pc.addTrack(tr, c.micro));
            c.dc = c.pc.createDataChannel('oai-events');
            c.dc.onmessage = (m) => { try { alEvento(JSON.parse(m.data)); } catch { /* evento ilegible */ } };
            const oferta = await c.pc.createOffer();
            await c.pc.setLocalDescription(oferta);
            const ahora = new Date();
            const r = await fetchWithAuth('/api/chat/live/sesion', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sdp: oferta.sdp,
                    session_id: sessionIdRef.current,
                    locale: localeRef.current,
                    local_date: `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`,
                    tz_offset: -ahora.getTimezoneOffset(),
                }),
                timeout: 25000,
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok || !d?.sdp) {
                if (d?.motivo === 'presupuesto') setDisponible(false);
                throw Object.assign(new Error('sesion'), { motivo: d?.motivo });
            }
            if (conexionRef.current !== c) return;   // lo cerraron mientras tanto
            c.liveId = d.live_id;
            await c.pc.setRemoteDescription({ type: 'answer', sdp: d.sdp });
            c.sondeo = setInterval(sondear, LIVE_SONDEO_MS);
            setEstado('escuchando');
        } catch (e) {
            if (conexionRef.current === c) soltar();
            const motivo = e?.motivo;
            setError(MOTIVOS[motivo] || (e?.name === 'NotAllowedError' ? i18nKey('Permite el micrófono para dictar') : i18nKey('No se pudo conectar la voz en vivo')));
            setEstado('error');
        }
    }, [disponible, alEvento, soltar, sondear]);

    const cerrar = useCallback(() => {
        const c = conexionRef.current;
        if (c?.dc?.readyState === 'open') {
            try { c.dc.send(JSON.stringify({ type: 'session.close' })); } catch { /* ya cerrado */ }
        }
        // Lo que el coach hizo en el último turno se aplica aunque se cierre ya.
        if (c?.liveId) sondear();
        setTimeout(soltar, 1500);
        setEstado('cerrado');
        setOido('');
        setDicho('');
    }, [soltar, sondear]);

    useEffect(() => () => soltar(), [soltar]);

    const tocar = useCallback(() => { /* full-duplex: se habla sin tocar; interrumpir es hablar encima */ }, []);
    const hablar = useCallback(() => { /* la voz la pone GPT-Live-1, no el stream del chat */ }, []);

    return { disponible, abierto: estado !== 'cerrado', estado, oido, dicho, error, pulso, abrir, cerrar, tocar, hablar };
}
