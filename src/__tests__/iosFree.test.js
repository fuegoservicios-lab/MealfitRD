import { describe, it, expect, vi } from 'vitest';
const platform = vi.hoisted(() => ({ value: 'web' }));
vi.mock('../config/platform', () => ({ nativePlatform: () => platform.value }));
import { iosFreeProfile } from '../utils/iosFree';
import { limiteDePlanes } from '../utils/regalosCuenta';

describe('Free iOS entitlements', () => {
    it('masks paid and admin tiers, including cached profiles, only in iOS', () => {
        const paid = { plan_tier: 'ultra', plan_tier_pagado: 'plus', cortesia: { plan: 'ultra' }, plan_mode: 'tracking' };
        platform.value = 'ios';
        expect(iosFreeProfile(paid)).toMatchObject({ plan_tier: 'gratis', plan_tier_pagado: 'gratis', cortesia: null, plan_mode: 'tracking' });
        expect(limiteDePlanes('admin', null)).toBe(100);
        expect(limiteDePlanes('ultra', { limit: 200 })).toBe(200);
        platform.value = 'web';
        expect(iosFreeProfile(paid)).toBe(paid);
        expect(limiteDePlanes('ultra', null)).toBe(500);
        platform.value = 'android';
        expect(iosFreeProfile(paid)).toBe(paid);
        platform.value = 'web';
    });
});
