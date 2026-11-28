import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    initPwaInstallCapture,
    canInstallPwa,
    subscribePwaInstall,
    triggerPwaInstall,
    _resetPwaInstallForTests,
} from '../utils/pwaInstall';

describe('pwaInstall utility', () => {
    let cleanup;

    beforeEach(() => {
        _resetPwaInstallForTests();
        cleanup = initPwaInstallCapture();
    });

    afterEach(() => {
        cleanup?.();
        _resetPwaInstallForTests();
        vi.restoreAllMocks();
    });

    it('captures beforeinstallprompt, notifies subscribers, and runs prompt once', async () => {
        expect(canInstallPwa()).toBe(false);

        const listener = vi.fn();
        const unsub = subscribePwaInstall(listener);

        const promptFn = vi.fn().mockResolvedValue(undefined);
        const ev = new Event('beforeinstallprompt');
        ev.preventDefault = vi.fn();
        ev.prompt = promptFn;
        ev.userChoice = Promise.resolve({ outcome: 'accepted' });

        window.dispatchEvent(ev);

        expect(ev.preventDefault).toHaveBeenCalledTimes(1);
        expect(canInstallPwa()).toBe(true);
        expect(listener).toHaveBeenCalledTimes(1);

        const res = await triggerPwaInstall();
        expect(promptFn).toHaveBeenCalledTimes(1);
        expect(res).toEqual({ outcome: 'accepted' });
        expect(canInstallPwa()).toBe(false);
        expect(listener).toHaveBeenCalledTimes(2);

        unsub();
    });

    it('clears deferred prompt on appinstalled event', () => {
        const listener = vi.fn();
        subscribePwaInstall(listener);

        const ev = new Event('beforeinstallprompt');
        ev.preventDefault = vi.fn();
        ev.prompt = vi.fn();
        ev.userChoice = Promise.resolve({ outcome: 'dismissed' });

        window.dispatchEvent(ev);
        expect(canInstallPwa()).toBe(true);

        window.dispatchEvent(new Event('appinstalled'));
        expect(canInstallPwa()).toBe(false);
        expect(listener).toHaveBeenCalledTimes(2);
    });
});
