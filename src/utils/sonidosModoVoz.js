/** Señales breves de entrada/salida, creadas dentro del toque para permitir audio en iOS. */
export const DURACION_SONIDO_VOZ_MS = 160;
export function sonarModoVoz(tipo) {
    let ctx;
    let respaldo;
    const liberar = () => {
        clearTimeout(respaldo);
        try { ctx?.close()?.catch?.(() => {}); } catch { /* el audio es opcional */ }
    };
    try {
        const Motor = window.AudioContext || window.webkitAudioContext;
        if (!Motor) return;
        ctx = new Motor();
        const notas = tipo === 'abrir' ? [660, 880] : [660, 440];
        const inicio = ctx.currentTime;
        notas.forEach((frecuencia, i) => {
            const t = inicio + i * 0.075;
            const tono = ctx.createOscillator();
            const volumen = ctx.createGain();
            tono.type = 'sine';
            tono.frequency.setValueAtTime(frecuencia, t);
            volumen.gain.setValueAtTime(0, t);
            volumen.gain.linearRampToValueAtTime(0.045, t + 0.008);
            volumen.gain.linearRampToValueAtTime(0, t + 0.065);
            tono.connect(volumen);
            volumen.connect(ctx.destination);
            if (i === notas.length - 1) tono.onended = liberar;
            tono.start(t);
            tono.stop(t + 0.07);
        });
        // No retrasar el arranque del micrófono si el sistema bloquea los sonidos.
        respaldo = setTimeout(liberar, 1000);
        ctx.resume()?.catch?.(liberar);
    } catch { liberar(); }
}
