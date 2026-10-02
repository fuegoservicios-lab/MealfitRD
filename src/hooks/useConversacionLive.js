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
import { sonarModoVoz, DURACION_SONIDO_VOZ_MS } from '../utils/sonidosModoVoz';
import { crearVigiaDeSilencio, hayActividadDeAudio } from '../utils/cierreVozPorSilencio';
import { capturarMicrofonoDeVoz } from '../utils/capturaMicrofono';
import { avisarFalloDeVozEnVivo } from '../utils/diagnosticoVoz';

export const LIVE_SONDEO_MS = 2000;

const MOTIVOS = {
    presupuesto: i18nKey('Se agotó el saldo de la prueba de voz'),
    no_habilitado: i18nKey('La voz en vivo no está disponible'),
    // [P1-PLAN-LOTE-844] 428: `fetchWithAuth` ya abrió la hoja del permiso y repitió; llegar aquí es «Ahora no».
    permiso: i18nKey('Activa la IA para usar esto'),
};

export function useConversacionLive({ sessionId, locale = 'es-DO', alNovedad, alError } = {}) {
    const [disponible, setDisponible] = useState(false);
    const [estado, setEstado] = useState('cerrado');
    const [oido, setOido] = useState('');
    const [dicho, setDicho] = useState('');
    const [error, setError] = useState(null);
    const [pulso, setPulso] = useState(0);
    const conexionRef = useRef(null);   // { pc, dc, micro, audio, liveId, sondeo, visto }
    const cierreRef = useRef(null);
    const abiertoRef = useRef(false);
    const avisarCierre = useCallback(() => {
        if (!abiertoRef.current) return;
        abiertoRef.current = false;
        sonarModoVoz('cerrar');
    }, []);
    const alNovedadRef = useRef(alNovedad);
    const alErrorRef = useRef(alError);
    const sessionIdRef = useRef(sessionId);
    const localeRef = useRef(locale);
    useEffect(() => { alNovedadRef.current = alNovedad; alErrorRef.current = alError; sessionIdRef.current = sessionId; localeRef.current = locale; });

    useEffect(() => {
        let vivo = true;
        fetchWithAuth('/api/chat/live/disponible')
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
                if (!vivo || !d?.disponible) return;
                const codigo = typeof navigator.mediaDevices?.getUserMedia !== 'function' ? 'sin_microfono'
                    : typeof RTCPeerConnection !== 'function' ? 'sin_webrtc' : null;
                if (codigo) avisarFalloDeVozEnVivo({ fase: 'capacidad', codigo, idioma: localeRef.current });
                setDisponible(!codigo);
            })
            .catch(() => {});
        return () => { vivo = false; };
    }, []);

    const soltar = useCallback((c = conexionRef.current) => {
        if (conexionRef.current === c) conexionRef.current = null;
        if (!c) return;
        c.soltada = true;
        c.silencio?.detener();
        clearTimeout(c.vigiaAudio);
        clearTimeout(c.sondeo);
        c.pedidos?.forEach((ctrl) => ctrl.abort());
        try { c.micro?.getTracks().forEach((tr) => tr.stop()); } catch { /* ya parado */ }
        try { c.dc?.close(); } catch { /* ya cerrado */ }
        try { c.pc?.close(); } catch { /* ya cerrado */ }
        try { if (c.audio) { c.audio.srcObject = null; c.audio.remove(); } } catch { /* sin audio */ }
        try { if (!conexionRef.current && navigator.audioSession) navigator.audioSession.type = 'auto'; } catch { /* sin API */ }
    }, []);

    const sondear = useCallback(async (c = conexionRef.current, esperar = 0) => {
        if (!c?.liveId || c.soltada) return null;
        const ctrl = new AbortController();
        c.pedidos.add(ctrl);
        try {
            const r = await fetchWithAuth(`/api/chat/live/${c.liveId}/novedades?desde=${c.visto}&esperar_s=${esperar}`, {
                signal: ctrl.signal, timeout: 30000,
            });
            if (!r.ok) return null;
            const d = await r.json();
            if (c.soltada) return null;
            let nuevas = 0;
            for (const n of [...(d.novedades || [])].sort((a, b) => a.n - b.n)) {
                if (!Number.isInteger(n.n) || n.n <= c.visto) continue;
                c.visto = n.n;
                nuevas += 1;
                if (n.turno_completo === true && !n.aviso_diario) c.silencio?.esperar();
                if (n.aviso_diario) c.silencio?.actividad();
                try { alNovedadRef.current?.(n); } catch { /* una novedad rota no para las demás */ }
            }
            if (d.cerrada && conexionRef.current === c) { soltar(); avisarCierre(); setEstado('cerrado'); }
            return { ...d, nuevas };
        } catch { return null; /* sin red: se reconecta */ }
        finally { c.pedidos.delete(ctrl); }
    }, [soltar, avisarCierre]);

    const vigilar = useCallback((c) => {
        const siguiente = async () => {
            const inicio = Date.now();
            const d = await sondear(c, 20); // El servidor responde en cuanto hay un cambio, sin esperar al siguiente tic.
            if (conexionRef.current !== c || c.soltada) return;
            const espera = d?.nuevas ? 0 : Math.max(0, LIVE_SONDEO_MS - (Date.now() - inicio));
            c.sondeo = setTimeout(siguiente, d ? espera : LIVE_SONDEO_MS);
        };
        siguiente();
    }, [sondear]);

    const alEvento = useCallback((ev) => {
        const tipo = ev?.type || '';
        const texto = typeof ev?.delta === 'string' ? ev.delta : (typeof ev?.text === 'string' ? ev.text : '');
        if (tipo === 'session.input_transcript.delta') {
            conexionRef.current?.silencio?.actividad();
            setDicho('');
            setOido((o) => `${o}${texto}`.slice(-400));
            setEstado('escuchando');
        } else if (tipo === 'session.delegation.created') {
            conexionRef.current?.silencio?.ocuparse();
            setEstado('pensando');
        } else if (tipo === 'session.output_transcript.delta') {
            conexionRef.current?.silencio?.actividad();
            setOido('');
            setDicho((d) => `${d}${texto}`.slice(-400));
            setPulso((p) => p + 1);
            setEstado('hablando');
        } else if (tipo === 'session.closed') {
            sondear();
            soltar();
            avisarCierre();
            setEstado('cerrado');
        } else if (tipo === 'error') {
            console.error('[P1-PLAN-LOTE-905] GPT-Live', ev);
        }
    }, [soltar, sondear, avisarCierre]);

    /** Dentro del toque del usuario: micrófono → oferta WebRTC → nuestro servidor → respuesta de OpenAI. */
    const abrir = useCallback(async () => {
        if (!disponible || conexionRef.current) return;
        setError(null);
        setOido('');
        setDicho('');
        setEstado('pensando');
        const c = { pc: null, dc: null, micro: null, audio: null, liveId: null, sondeo: null, visto: 0, pedidos: new Set() };
        c.silencio = crearVigiaDeSilencio(() => { if (conexionRef.current === c) cierreRef.current?.(); });
        conexionRef.current = c;
        abiertoRef.current = true;
        const inicioSonido = Date.now();
        sonarModoVoz('abrir');
        let fase = 'microfono';
        try {
            c.micro = await capturarMicrofonoDeVoz();
            if (conexionRef.current !== c || !abiertoRef.current) { soltar(c); return; }
            c.micro.getTracks().forEach((tr) => { tr.enabled = false; });
            // iOS: una llamada (oír y hablar a la vez) por el altavoz, no bajito por el auricular.
            try { if (navigator.audioSession) navigator.audioSession.type = 'play-and-record'; } catch { /* sin API */ }
            fase = 'webrtc';
            c.pc = new RTCPeerConnection();
            c.audio = document.createElement('audio');
            c.audio.autoplay = true;
            c.audio.setAttribute('playsinline', '');
            document.body.appendChild(c.audio);
            c.pc.ontrack = (e) => { if (conexionRef.current === c) c.audio.srcObject = e.streams[0]; };
            c.micro.getTracks().forEach((tr) => c.pc.addTrack(tr, c.micro));
            c.dc = c.pc.createDataChannel('oai-events');
            c.dc.onmessage = (m) => { if (conexionRef.current !== c) return; try { alEvento(JSON.parse(m.data)); } catch { /* evento ilegible */ } };
            fase = 'oferta';
            const oferta = await c.pc.createOffer();
            fase = 'sdp_local';
            await c.pc.setLocalDescription(oferta);
            const ahora = new Date();
            fase = 'servidor';
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
                throw Object.assign(new Error('sesion'), { motivo: r.status === 428 ? 'permiso' : d?.motivo });
            }
            if (conexionRef.current !== c || !abiertoRef.current) return;   // lo cerraron mientras tanto
            c.liveId = d.live_id;
            fase = 'sdp_remoto';
            await c.pc.setRemoteDescription({ type: 'answer', sdp: d.sdp });
            const restante = DURACION_SONIDO_VOZ_MS - (Date.now() - inicioSonido);
            if (restante > 0) await new Promise((r) => setTimeout(r, restante));
            if (conexionRef.current !== c || !abiertoRef.current) return;
            c.micro.getTracks().forEach((tr) => { tr.enabled = true; });
            c.silencio.esperar();
            const muestras = new Map();
            const medirAudio = async () => {
                if (conexionRef.current !== c || c.soltada) return;
                try {
                    const stats = await c.pc.getStats();
                    if (conexionRef.current !== c || c.soltada) return;
                    if (hayActividadDeAudio(stats, muestras)) c.silencio.actividad();
                } catch { /* los transcriptos también mantienen el plazo */ }
                if (conexionRef.current === c && !c.soltada) c.vigiaAudio = setTimeout(medirAudio, 250);
            };
            medirAudio();
            vigilar(c);
            setEstado('escuchando');
        } catch (e) {
            if (conexionRef.current !== c || !abiertoRef.current) return;
            if (conexionRef.current === c) soltar();
            avisarCierre();
            const motivo = e?.motivo;
            const permisoDenegado = ['NotAllowedError', 'SecurityError'].includes(e?.name);
            const mensaje = MOTIVOS[motivo] || (permisoDenegado ? i18nKey('Permite el micrófono para dictar') : i18nKey('No se pudo conectar la voz en vivo'));
            setError(mensaje);
            setEstado('error');
            avisarFalloDeVozEnVivo({ fase, codigo: e?.name, idioma: localeRef.current });
            try {
                alErrorRef.current?.({ mensaje, fase, puedeUsarRespaldo:
                    ['microfono', 'webrtc', 'oferta', 'sdp_local'].includes(fase) && !permisoDenegado });
            } catch { /* feedback must not interrupt cleanup */ }
        }
    }, [disponible, alEvento, soltar, vigilar, avisarCierre]);

    const cerrar = useCallback(() => {
        const c = conexionRef.current;
        c?.silencio?.detener();
        clearTimeout(c?.vigiaAudio);
        if (c?.dc?.readyState === 'open') {
            try { c.dc.send(JSON.stringify({ type: 'session.close' })); } catch { /* ya cerrado */ }
        }
        // Lo que el coach hizo en el último turno se aplica aunque se cierre ya.
        if (c?.liveId) sondear();
        clearTimeout(c?.sondeo);
        // Cortar el audio antes del tono: no enviarlo al agente ni mezclarlo con su respuesta.
        try { c?.micro?.getTracks().forEach((tr) => tr.stop()); } catch { /* ya parado */ }
        if (c?.audio) c.audio.srcObject = null;
        avisarCierre();
        setTimeout(() => soltar(c), 1500);
        conexionRef.current = null;
        setEstado('cerrado');
        setOido('');
        setDicho('');
    }, [soltar, sondear, avisarCierre]);

    useEffect(() => { cierreRef.current = cerrar; }, [cerrar]);

    useEffect(() => () => soltar(), [soltar]);

    const tocar = useCallback(() => { /* full-duplex: se habla sin tocar; interrumpir es hablar encima */ }, []);
    const hablar = useCallback(() => { /* la voz la pone GPT-Live-1, no el stream del chat */ }, []);
    const notificarBorrado = useCallback(() => { conexionRef.current?.silencio?.actividad(); }, []);

    return { disponible, abierto: estado !== 'cerrado' && estado !== 'error', estado, oido, dicho, error, pulso, abrir, cerrar, tocar, hablar, notificarBorrado };
}
