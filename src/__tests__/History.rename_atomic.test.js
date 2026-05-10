// [P1-HIST-5 · 2026-05-09] Tests estáticos del rename atómico en
// History.jsx (handleEditSave switcheado al endpoint backend).
//
// Bug original (audit historial 2026-05-08):
//   handleEditSave hacía `supabase.from('meal_plans').update({ name })`
//   directo. Solo actualizaba la columna top-level; `plan_data.name`
//   quedaba con el valor viejo. Cualquier flujo que copiara plan_data
//   después (swap, shift_plan, restore pre-P0-HIST-1, serializaciones
//   en backend) propagaba el nombre stale a otro contexto.
//
// Fix:
//   - Helper `renamePlan(planId, name)` en config/api.js → PATCH al
//     endpoint atómico backend.
//   - handleEditSave usa el helper y actualiza el state mirror para
//     reflejar el cambio en columna Y plan_data.name.
//
// Cobertura (regex sobre source — sin JSDOM):
//   - Helper exportado con shape PATCH + body { name }.
//   - handleEditSave usa renamePlan (no supabase.update directo).
//   - El state mirror actualiza p.plan_data.name además de p.name.
//   - selectedPlan idéntico (modal sigue mostrando el nuevo nombre).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _HISTORY_PATH = join(__dirname, '..', 'pages', 'History.jsx');
const _API_PATH = join(__dirname, '..', 'config', 'api.js');

const src = readFileSync(_HISTORY_PATH, 'utf8');
const apiSrc = readFileSync(_API_PATH, 'utf8');

describe('[P1-HIST-5] api.js — renamePlan helper', () => {
    it('exporta renamePlan como (planId, newName) =>', () => {
        expect(apiSrc).toMatch(
            /export\s+const\s+renamePlan\s*=\s*\(\s*planId\s*,\s*newName\s*\)\s*=>/
        );
    });

    it('llama PATCH /api/plans/${planId}/name con body { name }', () => {
        const fnIdx = apiSrc.indexOf('export const renamePlan');
        expect(fnIdx).toBeGreaterThan(-1);
        const block = apiSrc.slice(fnIdx, fnIdx + 400);
        expect(block).toMatch(/method:\s*['"]PATCH['"]/);
        expect(block).toMatch(/\/api\/plans\/\$\{planId\}\/name/);
        // body es JSON con la key `name`.
        expect(block).toMatch(/JSON\.stringify\(\s*\{\s*name:\s*newName\s*\}\s*\)/);
        // Content-Type explícito (sin él, fastapi parser puede interpretar
        // raw como string en lugar de JSON).
        expect(block).toMatch(/Content-Type/);
    });

    it('marca el helper con anchor [P1-HIST-5 · 2026-05-09]', () => {
        expect(apiSrc).toMatch(/\[P1-HIST-5\s*·\s*2026-05-09\]/);
    });
});

describe('[P1-HIST-5] History.jsx — handleEditSave usa renamePlan', () => {
    it('importa renamePlan desde config/api', () => {
        const importLine = src.match(
            /import\s*\{[^}]+\}\s*from\s*['"]\.\.\/config\/api['"]/
        );
        expect(importLine).toBeTruthy();
        expect(importLine[0]).toMatch(/renamePlan/);
    });

    it('handleEditSave llama renamePlan (no supabase.update directo)', () => {
        const handlerIdx = src.indexOf('const handleEditSave = async');
        expect(handlerIdx).toBeGreaterThan(-1);
        const handlerEndIdx = src.indexOf('};', handlerIdx);
        const block = src.slice(handlerIdx, handlerEndIdx);

        // Debe llamar el helper.
        expect(block).toMatch(/renamePlan\(\s*plan\.id\s*,\s*trimmed\s*\)/);
        // El handler NO debe seguir usando supabase update directo
        // sobre la tabla meal_plans para `name`. Si alguien revierte,
        // este test alerta.
        expect(block).not.toMatch(
            /supabase\s*\.\s*from\s*\(\s*['"]meal_plans['"]\s*\)\s*\.\s*update\(\s*\{\s*name:/
        );
    });

    it('valida response.ok y throw para que catch maneje el error', () => {
        const handlerIdx = src.indexOf('const handleEditSave = async');
        const block = src.slice(handlerIdx, handlerIdx + 1500);
        expect(block).toMatch(/response\.ok/);
        expect(block).toMatch(/throw\s+new\s+Error/);
    });

    it('marca el cambio con anchor [P1-HIST-5 · 2026-05-09]', () => {
        expect(src).toMatch(/\[P1-HIST-5\s*·\s*2026-05-09\]/);
    });
});

describe('[P1-HIST-5] state mirror — plan_data.name también se actualiza', () => {
    it('setPlans escribe { ...p, name: trimmed, plan_data: { ...plan_data, name: trimmed, ... } }', () => {
        // Sin esto, el state local quedaría con `p.name` actualizado
        // pero `p.plan_data.name` stale. Cualquier read de
        // `plan.plan_data?.name` (e.g., renderMealPreview, downstream
        // consumers) vería el valor viejo.
        //
        // [P1-HIST-AUDIT-4 · 2026-05-09] El bloque ahora también
        // sella `_plan_modified_at` para que el sort client-side
        // suba el plan post-rename (ya no esperamos al next fetch).
        const handlerIdx = src.indexOf('const handleEditSave = async');
        const block = src.slice(handlerIdx, handlerIdx + 3000);

        // Mirror sobre `plans` array.
        expect(block).toMatch(/setPlans\(/);
        expect(block).toMatch(/name:\s*trimmed/);
        // El plan_data debe spread + override de name (permite keys
        // adicionales como `_plan_modified_at` post-AUDIT-4).
        expect(block).toMatch(
            /plan_data:\s*p\.plan_data\s*\?\s*\{\s*\.\.\.\s*p\.plan_data\s*,\s*name:\s*trimmed[\s\S]*?\}/
        );
    });

    it('selectedPlan se actualiza idénticamente (modal sigue mostrando nuevo nombre)', () => {
        const handlerIdx = src.indexOf('const handleEditSave = async');
        const block = src.slice(handlerIdx, handlerIdx + 3000);

        expect(block).toMatch(/setSelectedPlan\(/);
        // El selectedPlan también necesita el mirror del plan_data.
        expect(block).toMatch(
            /plan_data:\s*selectedPlan\.plan_data\s*\?\s*\{\s*\.\.\.\s*selectedPlan\.plan_data\s*,\s*name:\s*trimmed[\s\S]*?\}/
        );
    });

    it('no copia plan_data si era null/undefined (defensivo)', () => {
        // El ternary `p.plan_data ? { ... } : p.plan_data` evita
        // crear un objeto `{ name: trimmed }` desde scratch en filas
        // legacy sin plan_data. Si alguien lo cambia a `?? { name }`,
        // creamos un plan_data hueco con solo name — drift opuesto.
        const handlerIdx = src.indexOf('const handleEditSave = async');
        const block = src.slice(handlerIdx, handlerIdx + 2500);
        expect(block).toMatch(/p\.plan_data\s*\?\s*\{[^}]*\}\s*:\s*p\.plan_data/);
    });
});
