import { isNativeApp } from '../config/platform';

const nativeFeedback = async (kind) => {
    const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics');
    if (kind === 'success' || kind === 'error' || kind === 'warning') {
        const type = {
            success: NotificationType.Success,
            error: NotificationType.Error,
            warning: NotificationType.Warning,
        }[kind];
        await Haptics.notification({ type });
        return;
    }
    await Haptics.impact({ style: kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light });
};

export function triggerMobileHaptic(kind = 'light') {
    if (isNativeApp()) {
        nativeFeedback(kind).catch(() => {});
        return;
    }
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(kind === 'medium' ? 40 : 25);
    }
}
