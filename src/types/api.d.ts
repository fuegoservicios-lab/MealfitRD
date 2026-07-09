// [P1-1 · TS Fase 0 · 2026-07-09] Shapes de respuesta del ingress de datos.
// Formalizan los comentarios "Response shape:" ya presentes en config/api.js.
// P2-6 (api.ts) los enforzara dandole a cada helper un Promise<Shape>.
import type { PlanSummary } from './plan';

export interface HistoryListResponse {
  plans: PlanSummary[];
}

export interface LessonsCountsResponse {
  /** plan_id -> conteo. Planes sin entradas no aparecen (se tratan como 0). */
  counts: Record<string, number>;
}

export interface HistoryStatusSummaryEntry {
  pending_user_action_count: number;
  failed_count: number;
  in_flight_count: number;
  completed_count: number;
  total: number;
}

export interface HistoryStatusSummaryResponse {
  summary: Record<string, HistoryStatusSummaryEntry>;
}
