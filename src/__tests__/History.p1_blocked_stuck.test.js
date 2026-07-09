// [P1-HIST-BLOCKED-STUCK · 2026-05-09] Tests del surface de chunks
// atascados (`processing`/`stale` con lag > threshold) en el modal
// del Historial.
//
// Bug original (audit Historial 2026-05-09 · gap P1-3):
//   El wrapper `getPlanBlockedReasons` solo pasaba `include_failed=true`.
//   Chunks atascados en `processing`/`stale` con lag alto (worker
//   zombi, advisory lock heredado, pipeline colgado tras LLM timeout
//   sin escalar) no aparecían en el banner del modal hasta que el
//   cron los pasaba a `failed` (≥1h después del threshold).
//
// Fix:
//   1. Wrapper suma `&include_stuck=true` al endpoint.
//   2. Lazy fetch se dispara también cuando `chunk_in_flight_count > 0`
//      (no solo PUAC/failed/exhausted).
//   3. Render: nuevo mini-bloque `stuckBanner` (info, azul) que aparece
//      cuando hay reasons stuck Y NO hay action_required/exhausted/PUAC/
//      failed (sino sería ruido duplicado dentro del banner rojo).
//
// Cobertura:
//   - Anchor del marker.
//   - Wrapper apunta al endpoint con include_failed=true Y include_stuck=true.
//   - onClick del card dispara _ensureBlockedReasons cuando in_flight > 0.
//   - Mini-bloque stuckBanner: condición de render, lista per-chunk
//     con lag formateado, copy info (no scare).
//   - CSS: clases stuckBanner* con palette azul (NO rojo del actionBanner).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _HISTORY_PATH = join(__dirname, '..', 'pages', 'History.jsx');
const _CSS_PATH = join(__dirname, '..', 'pages', 'History.module.css');
const _API_PATH = join(__dirname, '..', 'config', 'api.ts');

const src = readFileSync(_HISTORY_PATH, 'utf8');
const cssSrc = readFileSync(_CSS_PATH, 'utf8');
const apiSrc = readFileSync(_API_PATH, 'utf8');


describe('[P1-HIST-BLOCKED-STUCK] anchor + wrapper api', () => {
    it('marker presente en History.jsx', () => {
        expect(src).toMatch(/\[P1-HIST-BLOCKED-STUCK\s*·\s*2026-05-09\]/);
    });

    it('marker presente en config/api.js', () => {
        expect(apiSrc).toMatch(/\[P1-HIST-BLOCKED-STUCK\s*·\s*2026-05-09\]/);
    });

    it('marker presente en History.module.css', () => {
        expect(cssSrc).toMatch(/\[P1-HIST-BLOCKED-STUCK\s*·\s*2026-05-09\]/);
    });

    it('getPlanBlockedReasons pasa include_failed=true Y include_stuck=true', () => {
        // El wrapper debe llamar al endpoint con AMBOS query params.
        // include_failed era el contrato pre-existente (P2-HIST-AUDIT-9);
        // include_stuck es el adicional de P1-3.
        expect(apiSrc).toMatch(
            /getPlanBlockedReasons\s*=\s*\([^)]*\)\s*=>[\s\S]{0,300}?include_failed=true[\s\S]{0,200}?include_stuck=true/
        );
    });
});


describe('[P1-HIST-BLOCKED-STUCK] lazy fetch dispara con in_flight > 0', () => {
    it('onClick del card pasa chunk_in_flight_count al check', () => {
        // Antes: `if (_puac > 0 || _fc > 0 || _exh > 0)` — chunks
        // stuck (in_flight > 0 sin PUAC/failed) NO disparaban fetch.
        // Ahora suma `_inFlight > 0`.
        expect(src).toMatch(/_inFlight\s*=\s*\(typeof plan\.chunk_in_flight_count/);
        // El check final del onClick incluye _inFlight > 0.
        expect(src).toMatch(
            /_puac\s*>\s*0\s*\|\|\s*_fc\s*>\s*0\s*\|\|\s*_exh\s*>\s*0\s*\|\|\s*_inFlight\s*>\s*0/
        );
    });
});


describe('[P1-HIST-BLOCKED-STUCK] render del mini-bloque stuckBanner', () => {
    it('detecta reasons stuck via reason_code prefix', () => {
        // Filter `r.reason_code === 'stuck_processing' || r.reason_code === 'stuck_stale'`.
        const stuckIdx = src.indexOf('_stuckOnly');
        expect(stuckIdx).toBeGreaterThan(-1);
        const block = src.slice(stuckIdx, stuckIdx + 800);
        expect(block).toMatch(/stuck_processing/);
        expect(block).toMatch(/stuck_stale/);
        expect(block).toMatch(/_br\.filter/);
    });

    it('NO renderiza si banner action_required ya está activo (anti-duplicación)', () => {
        // Cuando hay action_required/exhausted/PUAC/failed, las
        // reasons stuck ya aparecen DENTRO del banner rojo. El
        // mini-bloque debe omitirse para no duplicar.
        const stuckIdx = src.indexOf('_stuckOnly');
        const block = src.slice(stuckIdx, stuckIdx + 2500);
        expect(block).toMatch(/_hasAction2/);
        expect(block).toMatch(/_exh2\s*>\s*0/);
        expect(block).toMatch(/_puac2\s*>\s*0/);
        expect(block).toMatch(/_fc2\s*>\s*0/);
    });

    it('helper _fmtLag formatea segundos como "Xh Ym"', () => {
        const fmtIdx = src.indexOf('_fmtLag');
        expect(fmtIdx).toBeGreaterThan(-1);
        const block = src.slice(fmtIdx, fmtIdx + 600);
        expect(block).toMatch(/Math\.floor\(sec\s*\/\s*3600\)/);
        expect(block).toMatch(/Math\.floor\(\(sec\s*%\s*3600\)\s*\/\s*60\)/);
    });

    it('lista per-chunk con week_number + lag formateado', () => {
        // Anchor en `_stuckOnly.map` directamente — el render de la
        // lista vive ~600 chars después del filter, dentro del JSX
        // del banner. Slice desde el `.map` cubre exactamente eso.
        const mapIdx = src.indexOf('_stuckOnly.map');
        expect(mapIdx).toBeGreaterThan(-1);
        const block = src.slice(mapIdx, mapIdx + 1500);
        expect(block).toMatch(/_stuckOnly\.map/);
        expect(block).toMatch(/r\.week_number/);
        expect(block).toMatch(/_fmtLag\(r\.lag_seconds\)/);
        // Label diferenciado por reason_code (procesando vs reanudando).
        expect(block).toMatch(/['"]reanudando['"]/);
        expect(block).toMatch(/['"]procesando['"]/);
    });

    it('copy del bloque es info (no scare)', () => {
        // Anchor en `stuckBannerTitle` (className única del bloque).
        const titleIdx = src.indexOf('stuckBannerTitle');
        expect(titleIdx).toBeGreaterThan(-1);
        const block = src.slice(titleIdx, titleIdx + 1500);
        // Copy esperada: tono informativo.
        expect(block).toMatch(/tardando m[aá]s de lo habitual/i);
        expect(block).toMatch(/cron lo[s]? retomar[aá]/i);
        // role="status" (no "alert" — no requiere acción).
        const stuckBlock = src.slice(
            src.indexOf('className={styles.stuckBanner}'),
            src.indexOf('className={styles.stuckBanner}') + 600,
        );
        expect(stuckBlock).toMatch(/role=['"]status['"]/);
    });

    it('usa Calendar icon (no AlertTriangle del banner rojo)', () => {
        const stuckIdx = src.indexOf('stuckBannerIcon');
        expect(stuckIdx).toBeGreaterThan(-1);
        const block = src.slice(stuckIdx, stuckIdx + 400);
        expect(block).toMatch(/<Calendar\s/);
        expect(block).not.toMatch(/<AlertTriangle\s/);
    });
});


describe('[P1-HIST-BLOCKED-STUCK] CSS palette info (azul, no rojo)', () => {
    it('clases stuckBanner* definidas', () => {
        const required = [
            'stuckBanner',
            'stuckBannerIcon',
            'stuckBannerContent',
            'stuckBannerTitle',
            'stuckBannerBody',
            'stuckBannerList',
            'stuckBannerListItem',
            'stuckBannerLag',
        ];
        for (const cls of required) {
            expect(cssSrc).toMatch(new RegExp(`\\.${cls}\\s*[\\{,]`));
        }
    });

    it('stuckBanner usa palette azul (info, no rojo de actionBanner)', () => {
        const blockMatch = cssSrc.match(/\.stuckBanner\s*\{[\s\S]*?\}/);
        expect(blockMatch).toBeTruthy();
        // Background blue-50 o similar.
        expect(blockMatch[0]).toMatch(/#EFF6FF|#DBEAFE|#E0F2FE/i);
        // NO debe usar red palette (ningún #FECxxx / #FEE / #FCAxxx).
        expect(blockMatch[0]).not.toMatch(/#FE[CFE]/i);
    });

    it('stuckBannerTitle usa color blue-800', () => {
        const blockMatch = cssSrc.match(/\.stuckBannerTitle\s*\{[\s\S]*?\}/);
        expect(blockMatch).toBeTruthy();
        // Color tier blue (~#1E40AF) — distinto del rojo de actionBannerTitle.
        expect(blockMatch[0]).toMatch(/#1E40AF|#1D4ED8|#1E3A8A/i);
    });
});
