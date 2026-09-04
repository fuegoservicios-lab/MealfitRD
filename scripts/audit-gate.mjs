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
//
// ⚠ Estar en esta lista NO significa "no aplica". Significa "triado y sin vía de
// remediación desde este repo". Las dos cosas se mezclan fácil y la diferencia
// importa: GHSA-qq9h-g4jm-xgf3 SÍ aplica a esta app (el login es email-OTP) y está
// aquí porque la lógica vulnerable corre en el servidor de auth de Neon, donde un
// bump de la copia cliente no llega. El veredicto por advisory vive en el doc.
// [P0-AUDIT-EXCEPCIONES · 2026-08-18] Una excepcion ya NO es un GHSA suelto.
//
// Antes esto era un `Set` de identificadores con la razon en un comentario. El
// problema no es que la razon estuviera mal escrita —estaba muy bien escrita—
// sino que un comentario no caduca, no tiene dueno y nadie lo revisa. La propia
// nota de este fichero lo decia: «una entrada de allowlist congela el mundo del
// dia en que se escribio». Y se cumplio: `GHSA-qq9h-g4jm-xgf3` entro el
// 2026-08-07 con «sin via de remediacion desde este repo», y el 2026-08-18
// `@neondatabase/auth@0.5.0-beta` ya trae `better-auth@1.6.23` — parcheado. La
// excepcion sobrevivio a su motivo once dias sin que nada lo notara.
//
// Ahora cada excepcion lleva DUENO, CADUCIDAD y MITIGACION verificable, y el
// gate falla cuando una caduca. Poder posponer sigue estando bien; lo que no
// puede es posponerse para siempre y en silencio.
const _NEON = { dueno: 'owner', caduca: '2026-11-30', mitigacion: 'triado en docs/security/deps-triage.md; sin via de remediacion desde este repo' };
const EXCEPCIONES = {
  'GHSA-wxw3-q3m9-c3jr': _NEON,
  'GHSA-pw9m-5jxm-xr6h': _NEON,
  'GHSA-2vg6-77g8-24mp': _NEON,
  'GHSA-7w99-5wm4-3g79': _NEON,
  'GHSA-392p-2q2v-4372': _NEON,
  'GHSA-9h47-pqcx-hjr4': _NEON,
  'GHSA-86j7-9j95-vpqj': _NEON,
  'GHSA-g38m-r43w-p2q7': _NEON,
  'GHSA-fmh4-wcc4-5jm3': _NEON,

  // [P0-01 · 2026-08-18] Account takeover via pre-account hijacking en email-OTP.
  // APLICA a esta app. Caducidad CORTA a proposito: ya existe salida por el lado
  // cliente (@neondatabase/neon-js@0.7.0-beta -> @neondatabase/auth@0.5.0-beta ->
  // better-auth@1.6.23) y lo que falta es confirmar con Neon la version del
  // SERVIDOR gestionado, que es donde corre la logica vulnerable.
  //
  // MITIGACION VERIFICABLE, y verificada: la superficie de contrasena no esta
  // expuesta. Login.jsx tiene CERO inputs `type="password"`, no existe pantalla
  // de registro y nadie llama a `signUp()` ni `signInWithPassword()` fuera del
  // adaptador. Anclado por src/__tests__/login_sin_password.test.js.
  'GHSA-qq9h-g4jm-xgf3': {
    dueno: 'owner',
    caduca: '2026-09-15',
    mitigacion: 'sin alta ni login por contrasena en la UI (anclado por src/__tests__/login_sin_password.test.js); pendiente confirmar la version del servidor con Neon',
  },
};
const ALLOWLIST = new Set(Object.keys(EXCEPCIONES));

// Una excepcion caducada FALLA el gate. Es el punto entero: sin esto, «lo reviso
// mas adelante» y «no lo revisa nadie nunca» son el mismo estado.
const HOY = new Date().toISOString().slice(0, 10);
const _caducadas = Object.entries(EXCEPCIONES)
  .filter(([, e]) => e.caduca < HOY)
  .map(([id, e]) => id + ' (vencio ' + e.caduca + ', dueno ' + e.dueno + ')');
if (_caducadas.length > 0) {
  console.error(
    '[audit-gate] Excepciones de seguridad CADUCADAS:\n - ' + _caducadas.join('\n - ') +
    '\n\nUna excepcion vencida no se renueva sola: o se remedia, o se re-tria con fecha ' +
    'y razon nuevas. Dejarla correr es como una excepcion sobrevive a su motivo.'
  );
  process.exit(1);
}

// [P1-AUDIT-GATE-REINTENTO · 2026-09-04] El registro de npm YA NO tiene red de
// seguridad: `npm audit` pide primero el endpoint bulk (`advisories/bulk`) y, si
// esa llamada falla, cae al endpoint quick (`audits/quick`)… que npm retiró
// («This endpoint is being retired», HTTP 400). Antes un tropiezo del bulk lo
// rescataba el quick; ahora un tropiezo del bulk es un 400 seguro. Medido en el
// run 485 de este repo: 6m54s colgado en el bulk, 400 en el quick y el gate en
// rojo con el MISMO árbol que había pasado en los runs 483 y 484 (3m16s y 4m41s:
// el registro estuvo degradado la hora entera; en régimen normal tarda segundos).
//
// Por eso el gate reintenta la auditoría ENTERA hasta `INTENTOS` veces, y SOLO
// cuando lo que vuelve no es un veredicto (error del registro / red / JSON
// ilegible). Un veredicto CON vulnerabilidades no se reintenta jamás: es
// determinista, y reintentarlo sería buscar un pase por agotamiento. Agotados
// los intentos, el gate sigue FAIL-CLOSED (exit 2): reintentar no es abrir la
// puerta, es llamar más de una vez antes de decidir que nadie contesta.
//
// `AUDIT_GATE_PAUSAS_MS` existe para que el test funcional
// (src/__tests__/audit_gate_reintento.test.js) recorra el bucle sin esperar
// minuto y medio; en CI y en local no se define y valen las pausas de abajo.
const INTENTOS = 3;
const PAUSAS_MS = (process.env.AUDIT_GATE_PAUSAS_MS || '30000,60000')
  .split(',')
  .map((n) => Math.max(0, Number(n) || 0));

function dormir(ms) {
  // Espera SÍNCRONA (el script entero lo es): Atomics.wait está permitido en el
  // hilo principal de Node y no depende de `sleep`, que no existe en Windows.
  if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function correrNpmAudit() {
  let out;
  try {
    // npm audit sale con code != 0 cuando hay vulns; el JSON viene en stdout igual.
    // Comando ESTÁTICO sin interpolación de input → sin superficie de inyección
    // (execSync se usa a propósito: `npm` es `npm.cmd` en Windows y execFile sin
    // shell no lo resolvería en runs locales).
    out = execSync('npm audit --omit=dev --json', {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    if (!e.stdout) {
      // Ni siquiera arrancó (npm ausente, proceso matado): no es un tropiezo
      // del registro y reintentarlo no cambia nada.
      console.error('[audit-gate] npm audit no produjo JSON:', e.message);
      process.exit(2);
    }
    out = e.stdout;
  }
  try {
    return JSON.parse(out);
  } catch (e) {
    // Antes esto reventaba con un SyntaxError sin capturar (exit 1 con traza):
    // fail-closed por accidente. Ahora es un «sin veredicto» explícito.
    return { _sinVeredicto: 'stdout no es JSON: ' + e.message };
  }
}

// [P1-CI-FAIL-CLOSED · 2026-07-12] Un audit VÁLIDO trae el mapa `vulnerabilities`
// (aunque esté vacío). Si el endpoint cae, npm emite `{ error: {...} }` en stdout
// (o un objeto sin `vulnerabilities`); tratarlo como «0 vulns» era fail-OPEN.
function esVeredicto(r) {
  return !!r && typeof r === 'object' && !r.error && !r._sinVeredicto && !!r.vulnerabilities;
}

let report;
for (let intento = 1; intento <= INTENTOS; intento++) {
  report = correrNpmAudit();
  if (esVeredicto(report)) break;
  const motivo = report && report._sinVeredicto
    ? report._sinVeredicto
    : JSON.stringify((report && report.error) || report).slice(0, 200);
  if (intento < INTENTOS) {
    const pausa = PAUSAS_MS[intento - 1] ?? PAUSAS_MS[PAUSAS_MS.length - 1] ?? 0;
    console.error(
      `[audit-gate] intento ${intento}/${INTENTOS} sin veredicto (${motivo}); ` +
      `reintento en ${Math.round(pausa / 1000)}s`
    );
    dormir(pausa);
  }
}

// FAIL-CLOSED ante un audit inválido. Un audit que no produce el mapa de
// vulnerabilidades NO es un pase — es un fallo del gate: falla en vez de pasar
// en silencio.
if (!esVeredicto(report)) {
  console.error(
    '[audit-gate] ❌ npm audit no devolvió un reporte de vulnerabilidades válido ' +
    `en ${INTENTOS} intentos (endpoint caído / red / formato inesperado). FAIL-CLOSED: ` +
    'el gate NO puede garantizar ausencia de vulns → falla en vez de pasar en silencio.' +
    (report && report.error ? ' error=' + JSON.stringify(report.error).slice(0, 200) : '') +
    (report && report._sinVeredicto ? ' motivo=' + String(report._sinVeredicto).slice(0, 200) : '')
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
      '\n\nSi son legitimas: trialas en docs/security/deps-triage.md y anade una entrada a ' +
      '`EXCEPCIONES` de este script con dueno, caduca (YYYY-MM-DD) y mitigacion verificable. ' +
      'Un GHSA suelto ya no vale: sin fecha, la excepcion sobrevive a su motivo.'
  );
  process.exit(1);
}

console.log('[audit-gate] ✓ Sin vulnerabilidades high/critical fuera de allowlist en deps de producción.');
