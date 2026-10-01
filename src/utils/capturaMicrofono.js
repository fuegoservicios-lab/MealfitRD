/** Prefer a mono voice track with echo/noise reduction and gain control, where the device supports them. */
export async function capturarMicrofonoDeVoz(mediaDevices = navigator.mediaDevices) {
    let disponibles = null;
    try { disponibles = mediaDevices.getSupportedConstraints?.(); } catch { /* optional capability probe */ }
    const audio = {};
    for (const [clave, ideal] of Object.entries({
        channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true,
    })) {
        if (!disponibles || disponibles[clave]) audio[clave] = { ideal };
    }
    try {
        return await mediaDevices.getUserMedia({ audio: Object.keys(audio).length ? audio : true, video: false });
    } catch (error) {
        // A device rejecting preferences still gets the working capture path. Never retry a denied permission.
        if (Object.keys(audio).length && error?.name === 'OverconstrainedError') {
            return mediaDevices.getUserMedia({ audio: true, video: false });
        }
        throw error;
    }
}
