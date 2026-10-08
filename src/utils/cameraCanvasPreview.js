// Vista previa de iOS sin la capa de vídeo nativa, que puede pintar la cámara
// vertical pequeña dentro de un rectángulo negro aunque sus medidas CSS sean correctas.
export function cameraCoverCrop(sourceWidth, sourceHeight, targetWidth, targetHeight) {
    const ratio = targetWidth / targetHeight;
    const width = Math.min(sourceWidth, sourceHeight * ratio);
    const height = Math.min(sourceHeight, sourceWidth / ratio);
    return [(sourceWidth - width) / 2, (sourceHeight - height) / 2, width, height];
}

export function startCameraCanvasPreview(video, canvas, frame, {
    onFirstFrame, onError, pixelRatio = window.devicePixelRatio || 1,
} = {}) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
        onError?.(new Error('No se pudo iniciar la vista previa de cámara'));
        return () => {};
    }
    let stopped = false;
    let painted = false;
    let requestId = null;
    let lastDraw = -Infinity;
    let targetWidth = 0;
    let targetHeight = 0;
    const sizeCanvas = () => {
        const { width, height } = frame.getBoundingClientRect();
        if (!width || !height) { targetWidth = 0; targetHeight = 0; return; }
        // La vista previa no necesita un lienzo a la resolución completa del sensor.
        const scale = Math.min(Math.max(1, pixelRatio), 2, 960 / Math.max(width, height));
        targetWidth = Math.max(1, Math.round(width * scale));
        targetHeight = Math.max(1, Math.round(height * scale));
        if (canvas.width !== targetWidth) canvas.width = targetWidth;
        if (canvas.height !== targetHeight) canvas.height = targetHeight;
    };
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(sizeCanvas) : null;
    observer?.observe(frame);
    window.addEventListener('resize', sizeCanvas);
    sizeCanvas();
    const draw = (time) => {
        if (stopped) return;
        if (time - lastDraw >= 1000 / 24 && video.readyState >= 2
            && video.videoWidth > 0 && video.videoHeight > 0 && targetWidth && targetHeight) {
            try {
                const crop = cameraCoverCrop(video.videoWidth, video.videoHeight, targetWidth, targetHeight);
                ctx.drawImage(video, ...crop, 0, 0, targetWidth, targetHeight);
                lastDraw = time;
                if (!painted) { painted = true; onFirstFrame?.(); }
            } catch (error) {
                stopped = true;
                onError?.(error);
                return;
            }
        }
        requestId = window.requestAnimationFrame(draw);
    };
    requestId = window.requestAnimationFrame(draw);
    return () => {
        stopped = true;
        if (requestId !== null) window.cancelAnimationFrame(requestId);
        observer?.disconnect();
        window.removeEventListener('resize', sizeCanvas);
        // Liberar el buffer al cerrar/capturar; nunca queda un loop de dibujo vivo.
        canvas.width = 1;
        canvas.height = 1;
    };
}
