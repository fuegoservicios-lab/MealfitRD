import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (rel) => readFileSync(resolve(process.cwd(), 'src', rel), 'utf8');

describe('plan_tier admin display in DashboardLayout and Dashboard', () => {
    it('DashboardLayout muestra Admin para admin y usa Ver planes', () => {
        const src = read('components/dashboard/DashboardLayout.jsx');
        const adminIdx = src.indexOf("userProfile?.plan_tier === 'admin' ? 'Admin'");
        const basicIdx = src.indexOf("t('Básico')", adminIdx);
        expect(adminIdx).toBeGreaterThan(-1);
        expect(basicIdx).toBeGreaterThan(adminIdx);
        expect(src).toContain("(isUltraTier || isAdminTier) ? t('Ver planes') : t('Mejorar plan')");
    });

    it('Dashboard muestra badge ADMIN antes del fallback a BÁSICO', () => {
        const src = read('pages/Dashboard.jsx');
        expect(src).toContain("(userProfile?.plan_tier === 'ultra' || userProfile?.plan_tier === 'admin') ? 'ultra'");
        const adminLabelIdx = src.indexOf("userProfile?.plan_tier === 'admin' ? 'ADMIN'");
        const basicLabelIdx = src.indexOf("t('BÁSICO')", adminLabelIdx);
        expect(adminLabelIdx).toBeGreaterThan(-1);
        expect(basicLabelIdx).toBeGreaterThan(adminLabelIdx);
    });
});
