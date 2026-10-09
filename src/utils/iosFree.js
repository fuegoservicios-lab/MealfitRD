import { nativePlatform } from '../config/platform';

export const IOS_FREE_GENERATION = 100;
export const IOS_FREE_COACH = 1000;

export function iosFreeProfile(profile) {
    if (!profile || nativePlatform() !== 'ios') return profile;
    return { ...profile, plan_tier: 'gratis', plan_tier_pagado: 'gratis', cortesia: null, access_model: 'ios_free' };
}
