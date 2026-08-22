import React, { useMemo, useState } from "react";
// [P3-HIST-MOBILE-REDESIGN · 2026-06-24] Diseño móvil aportado por el owner
// (HistorialMobile) injertado sobre el Historial real: edge-to-edge, datos y
// handlers reales, y los SVGs ACTUALES (calendario lucide + emojis de comida),
// NO los glyphs propios del prototipo. El detalle lo abre el modal REAL
// (History.jsx vía onOpen); aquí solo está la LISTA. Solo se monta en móvil.
import { CalendarDays, Flame, Search, Pencil, Trash2, Clock, X, Check } from "lucide-react";
// [P1-CLINICAL-MEAL-COUNT · 2026-06-27] Emoji por SLOT (no por índice) — planes de 3/5/6 comidas.
import { mealEmojiFor } from "../../utils/mealEmoji";
// [P1-2 · 2026-07-09] SSOT del coalescing days||meals||perfectDay (reemplaza la copia inline).
import { firstDayMeals } from "../../utils/normalizePlanDays";
// [P1-I18N-DASHBOARD · 2026-08-15] Motor de idioma. `useT()` dentro de los
// componentes (es lo que los suscribe al cambio de idioma); el `t`/`tn` sueltos
// para helpers de módulo que se INVOCAN en render (`normalizePlan`,
// `bucketTitle`, `activeBadge`), nunca al importar.
// [P1-I18N-FORMATOS-CLAVADOS · 2026-08-21] `formatNumber` se suma a los que ya
// estaban: los `toLocaleString('es-DO')` fijos de las kcal pintaban separadores
// dominicanos en las cuatro traducciones, y en pt-BR la coma es DECIMAL.
import { t, tn, useT, useI18n, formatDate, formatNumber } from "../../i18n";

/* --------------------------------------------------------- helpers */
// [P1-HIST-PANEL-FECHA-I18N · 2026-08-20] Era un formateador de fechas escrito a
// MANO en español —arrays de días y meses, el «de … de …» montado a pelo y el
// «a. m./p. m.»— duplicado en los dos paneles. Con la app en inglés la tarjeta
// decía «martes, 18 de agosto de 2026 · 6:52 p. m.» debajo de un título ya
// traducido.
//
// Lo que lo hacía invisible: NO usa `Intl`. El barrido que encontró y arregló los
// `toLocaleDateString('es-DO')` del repo pasó por encima de esto sin verlo, porque
// buscaba la API que este código precisamente no llama. Un formateador a mano no
// aparece en una búsqueda por API.
//
// `formatDate` (i18n/index.js) delega en `Intl.DateTimeFormat` con el locale
// ACTIVO, así que el orden de los campos, las preposiciones y el am/pm los pone
// cada idioma por su cuenta — que es justo lo que un montaje manual no puede hacer.
const fmtDate = (d) => formatDate(d, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fmtTime = (d) => formatDate(d, { hour: "numeric", minute: "2-digit" });
const daysAgo = (d) => Math.floor((Date.now() - d.getTime()) / 86400000);
// [I18N-EXEMPT: IDs de agrupacion, no copy: se traducen al PINTAR en bucketTitle (ver nota debajo)]
function bucketOf(d) { const n = daysAgo(d); if (n <= 0) return "Hoy"; if (n === 1) return "Ayer"; if (n <= 6) return "Esta semana"; if (n <= 13) return "La semana pasada"; return "Más antiguos"; }
// [I18N-EXEMPT: IDs de agrupacion; el orden se resuelve por el canonico, no por el rotulo]
const BUCKET_ORDER = ["Hoy", "Ayer", "Esta semana", "La semana pasada", "Más antiguos"];
// [P1-I18N-DASHBOARD · 2026-08-15] Igual que en el panel de escritorio: el bucket
// es un ID que resulta ser su propio texto español, así que se traduce al
// PINTARLO (traducirlo en `bucketOf` cambiaría las claves de agrupación y el
// orden de `BUCKET_ORDER`) y con LITERALES, porque un `t(variable)` es invisible
// a `npm run i18n:check` y su traducción nacería huérfana.
const bucketTitle = (id) => ({
  "Hoy": t("Hoy"),
  "Ayer": t("Ayer"),
  "Esta semana": t("Esta semana"),
  "La semana pasada": t("La semana pasada"),
  "Más antiguos": t("Más antiguos"),
})[id] || id;
const parseGrams = (v) => { const n = parseInt(String(v ?? ""), 10); return Number.isFinite(n) ? n : 0; };

// [P1-PLAN-DISPLAY-I18N · fase 1c] `locale` opcional: mismo contrato que la
// gemela de escritorio (`HistoryDesktopPanel::normalizePlan`) — fallback a
// `raw.plan_display_names[locale]` antes del `name` canónico español.
function normalizePlan(raw, activePlanId, locale) {
  const rawMeals = Array.isArray(raw.preview_meals)
    ? raw.preview_meals
    : firstDayMeals(raw.plan_data);
  const meals = (Array.isArray(rawMeals) ? rawMeals : [])
    .filter((m) => m && m.name && !m.isSkipped)
    .map((m) => ({ name: (locale && m.display_names?.[locale]) || m.name, emoji: mealEmojiFor(m.meal) }));
  return {
    raw,
    id: String(raw.id),
    name: (locale && raw.plan_display_names?.[locale]) || raw.name || t("Plan Generado"),
    date: new Date(raw.created_at),
    active: !!activePlanId && raw.id === activePlanId,
    kcal: typeof raw.calories === "number" ? raw.calories : (parseInt(raw.calories, 10) || 0),
    macros: { p: parseGrams(raw.macros?.protein), c: parseGrams(raw.macros?.carbs), g: parseGrams(raw.macros?.fats) },
    meals,
  };
}

function macroSplit(m) {
  const kc = { p: m.p * 4, c: m.c * 4, g: m.g * 9 };
  const t = kc.p + kc.c + kc.g;
  // [P2-DESIGN-CONSISTENCY · 2026-07-07] Macros alineados con Recetas/Historial-desktop:
  // Proteína=verde, Carbos=índigo, Grasa=rosa.
  if (!t) return [["#34D399", 0], ["#818CF8", 0], ["#FB7185", 0]];
  return [["#34D399", kc.p / t], ["#818CF8", kc.c / t], ["#FB7185", kc.g / t]];
}

/* --------------------------------------------------------- piezas */
function MacroBar({ macros }) {
  if (!(macros.p || macros.c || macros.g)) return <span style={{ flex: 1 }} />;
  return (
    <span style={{ display: "flex", flex: 1, height: 7, borderRadius: 99, overflow: "hidden", background: "var(--bg-muted)" }}>
      {macroSplit(macros).map(([c, w], i) => <i key={i} style={{ width: `${(w * 100).toFixed(1)}%`, background: c }} />)}
    </span>
  );
}

function Chips({ meals, max }) {
  if (!meals.length) return null;
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 11, overflow: "hidden" }}>
      {meals.slice(0, max).map((m, i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, flex: "none", maxWidth: 170, fontSize: ".76rem", fontWeight: 600,
          color: "var(--text-main)", background: "var(--bg-page)", border: "1px solid var(--border)", padding: "5px 10px 5px 6px", borderRadius: 99 }}>
          <span style={{ width: 18, height: 18, borderRadius: 6, flex: "none", display: "grid", placeItems: "center", fontSize: 11, background: "var(--bg-muted)" }}>{m.emoji}</span>
          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</span>
        </span>
      ))}
      {meals.length > max && (
        <span style={{ display: "inline-flex", alignItems: "center", flex: "none", fontSize: ".76rem", fontWeight: 600, color: "var(--text-muted)",
          background: "var(--bg-page)", border: "1px solid var(--border)", padding: "5px 11px", borderRadius: 99 }}>+{meals.length - max}</span>
      )}
    </div>
  );
}

/* Rename inline (reusa el flujo real: editingId / tempName / save / cancel) */
function NameEditor({ tempName, setTempName, onSave, onCancel }) {
  const t = useT();
  return (
    <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 7, flex: 1, minWidth: 0 }}>
      <input
        autoFocus
        value={tempName}
        onChange={(e) => setTempName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onSave(); if (e.key === "Escape") onCancel(); }}
        style={{ flex: 1, minWidth: 0, appearance: "none", font: "inherit", fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "1rem",
          color: "var(--text-main)", background: "var(--bg-page)", border: "1px solid var(--primary)", borderRadius: 9, padding: "5px 9px", outline: "none" }}
      />
      <button type="button" title={t("Guardar")} onClick={(e) => { e.stopPropagation(); onSave(); }} style={miniBtn}><Check size={15} /></button>
      <button type="button" title={t("Cancelar")} onClick={(e) => { e.stopPropagation(); onCancel(); }} style={miniBtn}><X size={15} /></button>
    </div>
  );
}

function PlanCard({ plan, paused = false, onOpen, onEdit, onDelete, editing, tempName, setTempName, onEditSave, onEditCancel }) {
  const t = useT();
  const [press, setPress] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => { if (!editing) onOpen(); }}
      onKeyDown={(e) => { if (!editing && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpen(); } }}
      onTouchStart={() => setPress(true)}
      onTouchEnd={() => setPress(false)}
      style={{ textAlign: "left", cursor: "pointer", color: "inherit", width: "100%", borderRadius: 18, padding: 15,
        transform: press && !editing ? "scale(.99)" : "none", transition: "transform .12s",
        border: `1px solid ${plan.active ? "color-mix(in srgb, var(--secondary) 45%, transparent)" : "var(--border)"}`,
        background: plan.active
          ? "linear-gradient(140deg, color-mix(in srgb, var(--secondary) 12%, transparent), transparent 60%), var(--bg-card)"
          : "var(--bg-card)" }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <span style={emblem}><CalendarDays size={22} strokeWidth={2.25} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {plan.active && <div style={{ marginBottom: 5 }}>{activeBadge(paused)}</div>}
          {editing ? (
            <NameEditor tempName={tempName} setTempName={setTempName} onSave={onEditSave} onCancel={onEditCancel} />
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
              <span style={{ fontFamily: "var(--font-heading)", fontSize: "1.02rem", fontWeight: 800, letterSpacing: "-.01em", color: "var(--text-main)", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{plan.name}</span>
              <button type="button" title={t("Renombrar")} onClick={(e) => { e.stopPropagation(); onEdit && onEdit(); }} style={{ ...cardIconBtn, width: 26, height: 26 }}><Pencil size={14} /></button>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: ".75rem", color: "var(--text-light)", marginTop: 3 }}>
            <Clock size={12} style={{ flexShrink: 0 }} /> <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fmtDate(plan.date)} · {fmtTime(plan.date)}</span>
          </div>
        </div>
        {!editing && (
          <button type="button" title={t("Eliminar")} onClick={(e) => { e.stopPropagation(); onDelete && onDelete(); }} style={cardIconBtn}><Trash2 size={16} /></button>
        )}
      </div>
      <Chips meals={plan.meals} max={2} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 13 }}>
        <MacroBar macros={plan.macros} />
        {plan.kcal > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, flex: "none", fontWeight: 800, fontFamily: "var(--font-heading)", fontSize: ".86rem", color: "#FB923C" }}>
            <Flame size={13} /> {formatNumber(plan.kcal)}
          </span>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------- panel raíz */
export default function HistoryMobilePanel({
  plans = [],
  total = 0,
  activePlanId = null,
  paused = false,
  searchQuery = "",
  setSearchQuery = () => {},
  onOpen = () => {},
  onEdit = () => {},
  onDelete = () => {},
  editingId = null,
  tempName = "",
  setTempName = () => {},
  onEditSave = () => {},
  onEditCancel = () => {},
}) {
  const t = useT();
  // [P1-PLAN-DISPLAY-I18N · fase 1c] Locale activo para el nombre del plan/meals
  // traducidos.
  const { locale } = useI18n();
  const q = searchQuery.trim().toLowerCase();
  const normalized = useMemo(
    () => plans.map((p) => normalizePlan(p, activePlanId, locale)),
    [plans, activePlanId, locale]
  );
  const active = normalized.find((p) => p.active);
  const rest = useMemo(() => normalized.filter((p) => !p.active && (!q || p.name.toLowerCase().includes(q))).sort((a, b) => b.date - a.date), [normalized, q]);
  const groups = useMemo(() => { const g = {}; rest.forEach((p) => { (g[bucketOf(p.date)] = g[bucketOf(p.date)] || []).push(p); }); return g; }, [rest]);

  const editProps = (p) => ({
    editing: editingId != null && String(editingId) === p.id,
    tempName,
    setTempName,
    onEditSave: () => onEditSave(p.raw),
    onEditCancel,
  });

  const showActive = active && (!q || active.name.toLowerCase().includes(q));
  const noResults = q && rest.length === 0 && !showActive;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "12px 16px calc(80px + env(safe-area-inset-bottom, 0px))", fontFamily: "var(--font-body)", color: "var(--text-main)" }}>
      {/* pastilla de conteo (centrada) */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <span style={countPill}><CalendarDays size={13} /> {tn(total, "{n} plan nutricional", "{n} planes nutricionales", { n: total })}</span>
      </div>

      {/* búsqueda */}
      <div style={searchWrap}>
        <Search size={16} style={{ flexShrink: 0 }} />
        <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={t("Buscar planes…")} aria-label={t("Buscar planes por nombre")} style={searchInput} />
        {q && (
          <button type="button" onClick={() => setSearchQuery("")} aria-label={t("Limpiar búsqueda")} style={{ ...miniBtn, width: 28, height: 28 }}><X size={14} /></button>
        )}
      </div>

      {showActive && (
        <PlanCard
          paused={paused}
          plan={active}
          onOpen={() => onOpen(active.raw)}
          onEdit={() => onEdit(active.raw)}
          onDelete={() => onDelete(active.raw)}
          {...editProps(active)}
        />
      )}

      {BUCKET_ORDER.filter((g) => groups[g]).map((g) => (
        <div key={g} style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={bucketLabel}>{bucketTitle(g)}</span>
            <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
            <span style={bucketCount}>{groups[g].length}</span>
          </div>
          {groups[g].map((p) => (
            <PlanCard
              key={p.id}
              paused={paused}
              plan={p}
              onOpen={() => onOpen(p.raw)}
              onEdit={() => onEdit(p.raw)}
              onDelete={() => onDelete(p.raw)}
              {...editProps(p)}
            />
          ))}
        </div>
      ))}

      {noResults && (
        <div style={{ padding: "40px 16px", textAlign: "center", color: "var(--text-light)" }}>
          <Search size={28} strokeWidth={1.75} />
          <p style={{ marginTop: 10 }}>{t("Sin resultados para")} <strong style={{ color: "var(--text-muted)" }}>“{searchQuery.trim()}”</strong></p>
          <button type="button" onClick={() => setSearchQuery("")} style={clearBtn}>{t("Limpiar búsqueda")}</button>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------- estilos compartidos */
const emblem = { flex: "none", width: 44, height: 44, borderRadius: 12, display: "grid", placeItems: "center", color: "#fff",
  background: "linear-gradient(150deg, var(--primary-light), var(--primary))", boxShadow: "0 8px 18px -10px var(--primary)" };
/* [P1-HIST-PAUSED-BADGE · 2026-08-14] De constante a factoria: el chip debe
   poder decir «En pausa» (ambar, sin vida) cuando el modo contador esta activo.
   Misma correccion que el hero de escritorio — la insignia derivaba «activo» de
   la mera existencia del plan, que la pausa conserva a proposito. */
const activeBadge = (paused = false) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", fontSize: ".58rem", fontWeight: 800, letterSpacing: ".07em",
    textTransform: "uppercase",
    color: paused ? "#FBBF24" : "var(--secondary)",
    background: paused ? "color-mix(in srgb, #FBBF24 14%, transparent)" : "color-mix(in srgb, var(--secondary) 16%, transparent)",
    border: `1px solid ${paused ? "color-mix(in srgb, #FBBF24 34%, transparent)" : "color-mix(in srgb, var(--secondary) 36%, transparent)"}`,
    padding: "3px 9px", borderRadius: 99 }}>
    <i style={{ width: 5, height: 5, borderRadius: "50%", background: paused ? "#FBBF24" : "var(--secondary)" }} /> {paused ? t("En pausa") : t("Activo")}
  </span>
);
const cardIconBtn = { flex: "none", width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", cursor: "pointer",
  appearance: "none", color: "var(--text-light)", background: "transparent", border: "1px solid transparent" };
const miniBtn = { flex: "none", width: 32, height: 32, borderRadius: 9, display: "grid", placeItems: "center", cursor: "pointer", appearance: "none",
  color: "var(--text-light)", background: "var(--bg-muted)", border: "1px solid var(--border)" };
const countPill = { display: "inline-flex", alignItems: "center", gap: 7, whiteSpace: "nowrap", fontFamily: "var(--font-heading)", fontSize: ".74rem", fontWeight: 700,
  color: "var(--primary)", background: "color-mix(in srgb, var(--primary) 13%, transparent)", border: "1px solid color-mix(in srgb, var(--primary) 28%, transparent)", padding: "5px 12px", borderRadius: 99 };
const searchWrap = { display: "flex", alignItems: "center", gap: 9, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: "11px 14px", color: "var(--text-light)" };
const searchInput = { appearance: "none", border: 0, background: "transparent", font: "inherit", fontSize: ".88rem", color: "var(--text-main)", width: "100%", outline: "none" };
const bucketLabel = { fontFamily: "var(--font-heading)", fontSize: ".72rem", fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text-light)" };
const bucketCount = { fontSize: ".7rem", fontWeight: 700, color: "var(--text-light)" };
const clearBtn = { marginTop: 8, appearance: "none", cursor: "pointer", font: "inherit", fontWeight: 700, fontSize: ".84rem", color: "var(--text-main)", background: "var(--bg-muted)", border: "1px solid var(--border)", borderRadius: 11, padding: "8px 16px" };
