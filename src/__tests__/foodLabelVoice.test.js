import { describe, it, expect, vi } from 'vitest';
import { prepararConexionVoz } from '../utils/prepararConexionVoz';
import { platoDesdeAnalisis, conPorcion, conMacroTecleada, macrosDelPlato } from '../components/dashboard/scanMealDishes';

const label = { serving_text: '3 galletas (34 g)', nutrients: [{ key: 'sodium_mg', amount: 135, unit: 'mg' }] };
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const peer = () => {
    const sender = { replaceTrack: vi.fn().mockResolvedValue() };
    return { sender, addTransceiver: () => ({ sender }), createOffer: vi.fn().mockResolvedValue({ sdp: 'offer' }), setLocalDescription: vi.fn().mockResolvedValue() };
};
const stream = () => { const track = { enabled: true, stop: vi.fn() }; return { track, getTracks: () => [track], getAudioTracks: () => [track] }; };

describe('food labels', () => {
    it('preserves declared serving and scales the same portion as macros', () => {
        const p = conPorcion(platoDesdeAnalisis({ photo_kind: 'etiqueta', food_facts: label, macros: { calories:170 } }), 2);
        expect(p.food_facts).toEqual(label);
        expect(p.porcion).toBe(2);
        expect(macrosDelPlato(p).calories).toBe(340);
        expect(conMacroTecleada(p, 'calories', 400).food_facts).toBeNull();
    });
    it('does not attribute a label to a photograph of a plate', () => {
        expect(platoDesdeAnalisis({ photo_kind:'plato',food_facts:label }).food_facts).toBeNull();
    });
});

describe('voice startup', () => {
    it('prepares SDP while permission is pending; microphone stays muted', async () => {
        const mic = deferred(), pc = peer(), audio = stream();
        const pending = prepararConexionVoz(pc, () => mic.promise, () => true, vi.fn());
        expect(pc.createOffer).toHaveBeenCalledOnce();
        expect(pc.sender.replaceTrack).not.toHaveBeenCalled();
        mic.resolve(audio);
        expect(await pending).toEqual({ sdp:'offer' });
        expect(audio.track.enabled).toBe(false);
        expect(pc.sender.replaceTrack).toHaveBeenCalledWith(audio.track);
    });
    it('stops a late microphone after closing without installing a track', async () => {
        const mic = deferred(), pc = peer(), audio = stream(); let active = true;
        const pending = prepararConexionVoz(pc, () => mic.promise, () => active, vi.fn());
        active = false; mic.resolve(audio);
        expect(await pending).toBeNull();
        expect(audio.track.stop).toHaveBeenCalled();
        expect(pc.sender.replaceTrack).not.toHaveBeenCalled();
    });
    it('propagates denied permission without preparing a remote session', async () => {
        const error = new DOMException('Denied', 'NotAllowedError');
        await expect(prepararConexionVoz(peer(), () => Promise.reject(error), () => true, vi.fn())).rejects.toBe(error);
    });
});
