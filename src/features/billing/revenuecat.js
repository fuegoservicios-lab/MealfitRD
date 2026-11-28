import { nativeIapAvailable } from '../../config/platform';
import { fetchWithAuth } from '../../config/api';

export const APPLE_PACKAGE_IDS = {
    basic_monthly: 'com.bioboros.basic.monthly',
    basic_annual: 'com.bioboros.basic.annual',
    plus_monthly: 'com.bioboros.plus.monthly',
    plus_annual: 'com.bioboros.plus.annual',
    ultra_monthly: 'com.bioboros.ultra.monthly',
    ultra_annual: 'com.bioboros.ultra.annual',
};

const PRODUCT_TO_SLOT = {
    'com.bioboros.basic.monthly': { tier: 'basic', period: 'monthly' },
    'com.bioboros.basic.annual': { tier: 'basic', period: 'annual' },
    'com.bioboros.plus.monthly': { tier: 'plus', period: 'monthly' },
    'com.bioboros.plus.annual': { tier: 'plus', period: 'annual' },
    'com.bioboros.ultra.monthly': { tier: 'ultra', period: 'monthly' },
    'com.bioboros.ultra.annual': { tier: 'ultra', period: 'annual' },
};

const PACKAGE_ID_TO_SLOT = {
    basic_monthly: { tier: 'basic', period: 'monthly' },
    basic_annual: { tier: 'basic', period: 'annual' },
    plus_monthly: { tier: 'plus', period: 'monthly' },
    plus_annual: { tier: 'plus', period: 'annual' },
    ultra_monthly: { tier: 'ultra', period: 'monthly' },
    ultra_annual: { tier: 'ultra', period: 'annual' },
};

let _configured = false;
let _configuredUserId = null;

async function _loadPurchases() {
    const mod = await import('@revenuecat/purchases-capacitor');
    // Devolver envuelto para que Promise no invoque `.then` sobre el Proxy de Capacitor.
    return { Purchases: mod.Purchases };
}

export async function initRevenueCat(userId) {
    if (!nativeIapAvailable() || !userId) return false;
    const apiKey = String(import.meta.env.VITE_REVENUECAT_IOS_KEY ?? '').trim();
    if (!apiKey) return false;

    const { Purchases } = await _loadPurchases();
    if (!_configured) {
        await Purchases.configure({ apiKey, appUserID: String(userId) });
        _configured = true;
        _configuredUserId = String(userId);
        return true;
    }
    if (_configuredUserId !== String(userId)) {
        await Purchases.logIn({ appUserID: String(userId) });
        _configuredUserId = String(userId);
    }
    return true;
}

export async function logoutRevenueCat() {
    if (!_configured || !nativeIapAvailable()) return;
    try {
        const { Purchases } = await _loadPurchases();
        await Purchases.logOut();
    } finally {
        _configuredUserId = null;
    }
}

export async function getNativeOfferings() {
    if (!nativeIapAvailable()) return {};
    const { Purchases } = await _loadPurchases();
    const offerings = await Purchases.getOfferings();
    const pkgs = offerings?.current?.availablePackages || [];
    const mapped = {};

    for (const pkg of pkgs) {
        const productId = pkg?.product?.identifier || '';
        const pkgId = pkg?.identifier || '';
        const slot = PRODUCT_TO_SLOT[productId] || PACKAGE_ID_TO_SLOT[pkgId];
        if (!slot) continue;
        if (!mapped[slot.tier]) mapped[slot.tier] = {};
        mapped[slot.tier][slot.period] = {
            aPackage: pkg,
            productId: productId || APPLE_PACKAGE_IDS[pkgId],
            priceString: pkg?.product?.priceString || '',
            price: pkg?.product?.price ?? null,
            currencyCode: pkg?.product?.currencyCode || 'USD',
        };
    }
    return mapped;
}

export async function syncAppleSubscription() {
    const response = await fetchWithAuth('/api/subscription/apple/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data?.detail || 'Apple subscription sync failed');
    }
    return data;
}

function _isUserCancelledError(err) {
    if (!err) return false;
    if (err.userCancelled === true) return true;
    const code = String(err.code || '').toUpperCase();
    return code === '1' || code === 'PURCHASE_CANCELLED_ERROR' || code === 'USER_CANCELLED';
}

export async function purchaseNativePlan(pkgInfo) {
    if (!pkgInfo?.aPackage) {
        throw new Error('Package unavailable');
    }
    const { Purchases } = await _loadPurchases();
    try {
        await Purchases.purchasePackage({ aPackage: pkgInfo.aPackage });
    } catch (err) {
        if (_isUserCancelledError(err)) {
            return { cancelled: true };
        }
        throw err;
    }
    const sync = await syncAppleSubscription();
    return { cancelled: false, sync };
}

export async function restoreNativePurchases() {
    const { Purchases } = await _loadPurchases();
    await Purchases.restorePurchases();
    return syncAppleSubscription();
}

export function syncRevenueCatSession(userId) {
    if (!userId || !nativeIapAvailable()) return;
    initRevenueCat(userId).catch(() => {});
}

export async function safeLogoutRevenueCat() {
    if (!nativeIapAvailable()) return;
    try {
        await logoutRevenueCat();
    } catch { /* no bloquea el logout */ }
}
