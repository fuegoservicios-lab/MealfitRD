import { expect, it, vi } from 'vitest';
import { leerResultados } from '../utils/dictado';
import { capturarMicrofonoDeVoz } from '../utils/capturaMicrofono';

const resultado = (text, isFinal = true) => Object.assign([{ transcript: text }], { isFinal });

it('keeps separately recognized words, foods and quantities separate without changing what was said', () => {
    expect(leerResultados([resultado('Me comí'), resultado('dos huevos'), resultado('con yuca')]))
        .toEqual({ finales: 'Me comí dos huevos con yuca', provisional: '' });
    expect(leerResultados([resultado('No tomé'), resultado('dos vasos'), resultado('solo uno', false)]))
        .toEqual({ finales: 'No tomé dos vasos', provisional: 'solo uno' });
});
it('preserves punctuation and boundaries already supplied by the recognizer', () => {
    expect(leerResultados([resultado('Desayuné huevos'), resultado(', pan'), resultado(' y café.')]).finales)
        .toBe('Desayuné huevos, pan y café.');
    expect(leerResultados([resultado('agua', false), resultado('y café', false)]).provisional).toBe('agua y café');
});
it('a revised provisional phrase replaces the old one without freezing an incorrect amount', () => {
    expect(leerResultados([resultado('Me bebí'), resultado('doce vasos', false)]).provisional).toBe('doce vasos');
    expect(leerResultados([resultado('Me bebí'), resultado('dos vasos')])).toEqual({ finales: 'Me bebí dos vasos', provisional: '' });
});
it('requests voice processing as preferences and returns the original track', async () => {
    const stream = { getTracks: vi.fn() };
    const getUserMedia = vi.fn(async () => stream);
    expect(await capturarMicrofonoDeVoz({ getUserMedia })).toBe(stream);
    expect(getUserMedia).toHaveBeenCalledWith({ audio: {
        channelCount: { ideal: 1 }, echoCancellation: { ideal: true },
        noiseSuppression: { ideal: true }, autoGainControl: { ideal: true },
    }, video: false });
});
it('omits unsupported processing rather than blocking the microphone on that device', async () => {
    const getUserMedia = vi.fn(async () => 'stream');
    await capturarMicrofonoDeVoz({ getUserMedia, getSupportedConstraints: () => ({ echoCancellation: true }) });
    expect(getUserMedia).toHaveBeenCalledWith({ audio: { echoCancellation: { ideal: true } }, video: false });
});
it('falls back for a device rejecting constraints, but never retries permission or hardware failures', async () => {
    const getUserMedia = vi.fn().mockRejectedValueOnce({ name: 'OverconstrainedError' }).mockResolvedValue('stream');
    expect(await capturarMicrofonoDeVoz({ getUserMedia })).toBe('stream');
    expect(getUserMedia).toHaveBeenLastCalledWith({ audio: true, video: false });
    for (const name of ['NotAllowedError', 'NotReadableError']) {
        const failed = vi.fn().mockRejectedValue({ name });
        await expect(capturarMicrofonoDeVoz({ getUserMedia: failed })).rejects.toEqual({ name });
        expect(failed).toHaveBeenCalledOnce();
    }
});
