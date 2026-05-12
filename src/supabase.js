
import { createClient } from '@supabase/supabase-js';

// [P1-AUDIT-2 · 2026-05-12 · finalizado P1-FRONTEND-1 2026-05-12]
// URL + anon-key se leen exclusivamente de variables de entorno Vite.
// Pre-fix, este archivo declaraba `_LEGACY_URL` / `_LEGACY_ANON_KEY`
// hardcoded como fallback para back-compat por una release. Cumplido:
// audit 2026-05-11 confirmó que los entornos productivos ya tienen
// .env correcto. Mantener el fallback más tiempo es activo riesgo:
// un build de QA con .env vacío apuntaba silenciosamente a producción
// (el anon-key es público por diseño pero `_LEGACY_URL` clavaba el
// proyecto).
//
// Comportamiento ahora:
//   - Si ambas env vars están presentes → cliente Supabase normal.
//   - Si alguna falta → THROW en el módulo (Vite expone error en build
//     prod; en dev `npm run dev` también falla al primer import).
//
// Esto fuerza disciplina de entorno y bloquea cross-environment leak.
//
// Anchor: P1-FRONTEND-1-NO-HARDCODED-FALLBACK
// Tests:
//   - frontend/src/__tests__/supabase_env_vars.test.js
//   - frontend/src/__tests__/supabase_no_legacy_fallback.test.js (P1-FRONTEND-1)

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
        '[P1-FRONTEND-1] VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY son ' +
        'obligatorias. Setear ambas en .env del entorno antes de build. ' +
        'Ver frontend/.env.example para los valores esperados.'
    );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
