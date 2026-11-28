import { describe, it, expect, vi } from 'vitest';
const platform = vi.hoisted(() => ({ value: 'web', iap: false }));
vi.mock('../config/platform', () => ({
    nativePlatform: () => platform.value,
    nativeIapAvailable: () => platform.iap,
}));
import { iosFreeProfile } from '../utils/iosFree';
import { limiteDePlanes } from '../utils/regalosCuenta';

describe('Free iOS entitlements', () => {
    it('masks paid and admin tiers in iOS without native IAP, and preserves when IAP or apple provider is active', () => {
        const paid = { plan_tier: 'ultra', plan_tier_pagado: 'plus', cortesia: { plan: 'ultra' }, plan_mode: 'tracking' };
        platform.value = 'ios';
        platform.iap = false;
        expect(iosFreeProfile(paid)).toMatchObject({ plan_tier: 'gratis', plan_tier_pagado: 'gratis', cortesia: null, plan_mode: 'tracking' });
        expect(limiteDePlanes('admin', null)).toBe(100);
        expect(limiteDePlanes('ultra', { limit: 200 })).toBe(200);

        // When native IAP is available on iOS, real tiers are preserved.
        platform.iap = true;
        expect(iosFreeProfile(paid)).toBe(paid);
        expect(limiteDePlanes('ultra', null)).toBe(60);

        // Even with iap=false, an Apple-paid profile is preserved.
        platform.iap = false;
        const applePaid = { ...paid, subscription_provider: 'apple' };
        expect(iosFreeProfile(applePaid)).toBe(applePaid);

        platform.value = 'web';
        expect(iosFreeProfile(paid)).toBe(paid);
        expect(limiteDePlanes('ultra', null)).toBe(60);   // [P1-PLAN-LOTE-1116] escalera nueva
        platform.value = 'android';
        expect(iosFreeProfile(paid)).toBe(paid);
        platform.value = 'web';
    });
});
