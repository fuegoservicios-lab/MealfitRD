/**
 * [P1-AUDIT-GATE-REINTENTO · 2026-09-04] El gate de vulnerabilidades reintenta
 * cuando el registro de npm no contesta, y SOLO entonces.
 *
 * Contexto: `npm audit` pide primero el endpoint bulk y, si falla, cae al quick…
 * que npm retiró (HTTP 400 «This endpoint is being retired»). Un tropiezo del
 * bulk ya no lo rescata nadie: el run 485 de este repo estuvo 6m54s colgado y
 * salió en rojo con el mismo árbol que había pasado en los runs 483 y 484.
 *
 * Lo que este test demuestra ejecutando el script de verdad contra un `npm`
 * falso en el PATH (un guion POSIX; en Windows se salta):
 *   1. dos «sin veredicto» y luego un veredicto limpio → pasa (exit 0) en 3 llamadas;
 *   2. tres «sin veredicto» → FAIL-CLOSED (exit 2), ni una llamada más;
 *   3. un veredicto CON vulnerabilidad no allowlisteada → exit 1 con UNA sola
 *      llamada: un veredicto no se reintenta (sería buscar un pase por agotamiento);
 *   4. stdout que no es JSON cuenta como «sin veredicto» (antes reventaba con un
 *      SyntaxError sin capturar).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GATE = path.join(RAIZ, 'scripts', 'audit-gate.mjs');

// Respuestas del npm falso, una por invocación (la n-ésima línea del plan).
const RESPUESTAS = {
  err: { stdout: '{"error":{"code":"E400","summary":"400 Bad Request - POST .../audits/quick","detail":""}}', exit: 1 },
  ok: { stdout: '{"auditReportVersion":2,"vulnerabilities":{},"metadata":{"vulnerabilities":{"total":0}}}', exit: 0 },
  vuln: {
    stdout: '{"auditReportVersion":2,"vulnerabilities":{"paquete-x":{"name":"paquete-x","severity":"high","via":[{"url":"https://github.com/advisories/GHSA-test-fake-0001"}]}},"metadata":{}}',
    exit: 1,
  },
  basura: { stdout: 'npm ERR! esto no es JSON', exit: 1 },
};

const NPM_FALSO = `#!/bin/sh
# npm falso para audit_gate_reintento.test.js: cuenta invocaciones y contesta
# segun la n-esima linea de $FAKE_NPM_PLAN.
n=$(cat "$FAKE_NPM_STATE" 2>/dev/null || echo 0)
n=$((n+1))
echo "$n" > "$FAKE_NPM_STATE"
resp=$(sed -n "\${n}p" "$FAKE_NPM_PLAN")
case "$resp" in
${Object.entries(RESPUESTAS)
  .map(([k, v]) => `  ${k}) printf '%s\\n' '${v.stdout}'; exit ${v.exit};;`)
  .join('\n')}
  *) echo "plan agotado en la invocacion $n" >&2; exit 99;;
esac
`;

let tmp;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-gate-'));
  fs.writeFileSync(path.join(tmp, 'npm'), NPM_FALSO, { mode: 0o755 });
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function correrGate(plan) {
  const state = path.join(tmp, 'state');
  const planFile = path.join(tmp, 'plan');
  fs.writeFileSync(planFile, plan.join('\n') + '\n');
  const res = spawnSync(process.execPath, [GATE], {
    cwd: RAIZ,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: tmp + path.delimiter + (process.env.PATH || ''),
      FAKE_NPM_STATE: state,
      FAKE_NPM_PLAN: planFile,
      AUDIT_GATE_PAUSAS_MS: '0,0',
    },
  });
  if (/CADUCADAS/.test(res.stderr)) {
    throw new Error(
      'el gate tiene una excepción de seguridad caducada y falla ANTES de auditar; ' +
        're-triar en scripts/audit-gate.mjs (no es un fallo del reintento):\n' + res.stderr
    );
  }
  const invocaciones = Number(fs.readFileSync(state, 'utf8').trim() || 0);
  return { status: res.status, stdout: res.stdout, stderr: res.stderr, invocaciones };
}

const esPosix = process.platform !== 'win32';

describe('[P1-AUDIT-GATE-REINTENTO] el gate reintenta sólo cuando no hay veredicto', () => {
  it('el script lleva el marker y el número de intentos anclado', () => {
    const src = fs.readFileSync(GATE, 'utf8');
    expect(src).toContain('P1-AUDIT-GATE-REINTENTO');
    expect(src).toMatch(/const INTENTOS = 3;/);
    // La pausa configurable existe para ESTE test; si desaparece, el bucle tarda
    // minuto y medio y el test se vuelve inejecutable.
    expect(src).toContain('AUDIT_GATE_PAUSAS_MS');
  });

  it.skipIf(!esPosix)('dos tropiezos del registro y luego un veredicto limpio → pasa en 3 llamadas', () => {
    const r = correrGate(['err', 'err', 'ok']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.invocaciones).toBe(3);
    expect(r.stderr).toMatch(/intento 1\/3 sin veredicto/);
    expect(r.stderr).toMatch(/intento 2\/3 sin veredicto/);
    expect(r.stdout).toMatch(/Sin vulnerabilidades high\/critical/);
  });

  it.skipIf(!esPosix)('tres tropiezos → FAIL-CLOSED con exit 2 y ni una llamada más', () => {
    const r = correrGate(['err', 'err', 'err', 'ok']);
    expect(r.status, r.stderr).toBe(2);
    expect(r.invocaciones).toBe(3);
    expect(r.stderr).toMatch(/FAIL-CLOSED/);
    expect(r.stderr).toMatch(/en 3 intentos/);
  });

  it.skipIf(!esPosix)('un veredicto con vulnerabilidad NO se reintenta: exit 1 con una sola llamada', () => {
    const r = correrGate(['vuln', 'ok', 'ok']);
    expect(r.status, r.stderr).toBe(1);
    expect(r.invocaciones).toBe(1);
    expect(r.stderr).toMatch(/GHSA-test-fake-0001/);
  });

  it.skipIf(!esPosix)('un veredicto limpio a la primera → una sola llamada', () => {
    const r = correrGate(['ok']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.invocaciones).toBe(1);
  });

  it.skipIf(!esPosix)('stdout que no es JSON cuenta como «sin veredicto» y se reintenta', () => {
    const r = correrGate(['basura', 'ok']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.invocaciones).toBe(2);
    expect(r.stderr).toMatch(/stdout no es JSON/);
  });
});
