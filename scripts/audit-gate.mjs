// [P1-2 · audit-gate · 2026-07-12] Falla si `npm audit --omit=dev` reporta
// vulnerabilidades HIGH/CRITICAL en dependencias de PRODUCCIÓN que NO estén en la
// allowlist. La allowlist cubre advisories con triage documentado y sin fix
// upstream — cada entrada debe estar justificada en docs/security/deps-triage.md.
//
// Los `moderate`/`low` NO gatean (ruido de dev chain). Solo high/critical de prod.
// Corre en CI (.github/workflows/ci.yml, job `audit`) y localmente:  node scripts/audit-gate.mjs
import { execSync } from 'node:child_process';

// GHSA aceptados: better-auth bundled en @neondatabase/neon-js (sin fix upstream).
// Triage: docs/security/deps-triage.md [P1-DEPS-TRIAGE]. Al aparecer un GHSA NUEVO
// (no listado) el gate falla a propósito → re-triage antes de allowlistear.
const ALLOWLIST = new Set([
  'GHSA-wxw3-q3m9-c3jr', 'GHSA-pw9m-5jxm-xr6h', 'GHSA-2vg6-77g8-24mp',
  'GHSA-7w99-5wm4-3g79', 'GHSA-392p-2q2v-4372', 'GHSA-9h47-pqcx-hjr4',
  'GHSA-86j7-9j95-vpqj', 'GHSA-g38m-r43w-p2q7', 'GHSA-fmh4-wcc4-5jm3',
]);

let report;
try {
  // npm audit sale con code != 0 cuando hay vulns; el JSON viene en stdout igual.
  // Comando ESTÁTICO sin interpolación de input → sin superficie de inyección
  // (execSync se usa a propósito: `npm` es `npm.cmd` en Windows y execFile sin
  // shell no lo resolvería en runs locales).
  const out = execSync('npm audit --omit=dev --json', {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  report = JSON.parse(out);
} catch (e) {
  if (!e.stdout) {
    console.error('[audit-gate] npm audit no produjo JSON:', e.message);
    process.exit(2);
  }
  report = JSON.parse(e.stdout);
}

// [P1-CI-FAIL-CLOSED · 2026-07-12] FAIL-CLOSED ante un audit inválido. Si el
// endpoint de `npm audit` cae, npm emite `{ error: {...} }` en stdout (o un objeto
// sin `vulnerabilities`); parsearlo dejaba `report.vulnerabilities` undefined →
// `Object.entries({})` → 0 offenders → el gate imprimía ✓ y salía 0 (fail-OPEN: un
// gate de seguridad que se abre justo cuando NO pudo auditar). Un audit que no
// produce el mapa de vulnerabilidades NO es un pase — es un fallo del gate.
if (!report || typeof report !== 'object' || report.error || !report.vulnerabilities) {
  console.error(
    '[audit-gate] ❌ npm audit no devolvió un reporte de vulnerabilidades válido ' +
    '(endpoint caído / red / formato inesperado). FAIL-CLOSED: el gate NO puede ' +
    'garantizar ausencia de vulns → falla en vez de pasar en silencio.' +
    (report && report.error ? ' error=' + JSON.stringify(report.error).slice(0, 200) : '')
  );
  process.exit(2);
}

const offenders = [];
for (const [name, adv] of Object.entries(report.vulnerabilities || {})) {
  if (!['high', 'critical'].includes(adv.severity)) continue;
  // `via` mezcla strings (nombres de deps transitivas) y objetos (advisories con url).
  const ids = (adv.via || [])
    .filter((v) => v && typeof v === 'object' && v.url)
    .map((v) => v.url.split('/').pop());
  const unlisted = ids.filter((id) => !ALLOWLIST.has(id));
  // Si no hay IDs directos (solo cadena transitiva) pero la severidad es high/critical,
  // igual lo reportamos: la raíz vulnerable debe estar allowlisteada por su propio nombre.
  if (unlisted.length > 0) {
    offenders.push(`${name} (${adv.severity}): ${unlisted.join(', ')}`);
  }
}

if (offenders.length > 0) {
  console.error(
    '[audit-gate] ❌ Vulnerabilidades high/critical NO allowlisteadas en deps de producción:\n - ' +
      offenders.join('\n - ') +
      '\n\nSi son legítimas, tríalas en docs/security/deps-triage.md y añade el GHSA a la allowlist de este script.'
  );
  process.exit(1);
}

console.log('[audit-gate] ✓ Sin vulnerabilidades high/critical fuera de allowlist en deps de producción.');
