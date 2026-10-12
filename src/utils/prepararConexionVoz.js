/** Prepare local WebRTC and microphone concurrently, only after the user's tap. */
export async function prepararConexionVoz(pc, capturar, vigente, recibirMicro) {
    const sender = pc.addTransceiver('audio', { direction: 'sendrecv' }).sender;
    const micro = capturar().then((stream) => {
        stream.getTracks().forEach((track) => { track.enabled = false; });
        recibirMicro(stream);
        if (!vigente()) stream.getTracks().forEach((track) => track.stop());
        return stream;
    });
    const offer = pc.createOffer().then(async (value) => {
        if (vigente()) await pc.setLocalDescription(value);
        return value;
    });
    const [stream, value] = await Promise.all([micro, offer]);
    if (!vigente()) return null;
    await sender.replaceTrack(stream.getAudioTracks()[0]);
    return vigente() ? value : null;
}
