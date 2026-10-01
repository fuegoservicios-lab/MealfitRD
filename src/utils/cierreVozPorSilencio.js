export const VOZ_CIERRE_POR_SILENCIO_MS = 10000;

/** Shared idle deadline. Changing from listening to pause must not buy another ten seconds. */
export function crearVigiaDeSilencio(cerrar) {
    let activo = false;
    let ocupado = false;
    let ultima = 0;
    let reloj = null;
    const cancelar = () => { clearTimeout(reloj); reloj = null; };
    const armar = () => {
        cancelar();
        if (!activo || ocupado) return;
        reloj = setTimeout(() => {
            reloj = null;
            if (!activo || ocupado) return;
            activo = false;
            cerrar();
        }, Math.max(0, VOZ_CIERRE_POR_SILENCIO_MS - (Date.now() - ultima)));
    };
    return {
        esperar() {
            if (!activo || ocupado) ultima = Date.now();
            activo = true;
            ocupado = false;
            armar();
        },
        actividad() {
            if (!activo) return;
            ultima = Date.now();
            armar();
        },
        ocuparse() { activo = true; ocupado = true; cancelar(); },
        detener() { activo = false; ocupado = false; cancelar(); },
    };
}

/** Local WebRTC statistics only: no audio is recorded or sent to another service. */
export function hayActividadDeAudio(stats, anteriores) {
    let audible = false;
    for (const r of stats.values()) {
        if (!['media-source', 'inbound-rtp'].includes(r.type) || (r.kind || r.mediaType) !== 'audio') continue;
        if (Number.isFinite(r.audioLevel) && r.audioLevel > 0.02) audible = true;
        const antes = anteriores.get(r.id);
        if (antes && r.totalSamplesDuration > antes.duration && r.totalAudioEnergy >= antes.energy) {
            const rms = Math.sqrt((r.totalAudioEnergy - antes.energy) / (r.totalSamplesDuration - antes.duration));
            if (rms > 0.02) audible = true;
        }
        if (Number.isFinite(r.totalAudioEnergy) && Number.isFinite(r.totalSamplesDuration)) {
            anteriores.set(r.id, { energy: r.totalAudioEnergy, duration: r.totalSamplesDuration });
        }
    }
    return audible;
}
