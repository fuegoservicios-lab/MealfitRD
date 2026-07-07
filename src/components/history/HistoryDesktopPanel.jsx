import React, { useMemo, useState } from "react";
// [P3-HIST-DESKTOP-ICONS · 2026-06-24] El owner prefiere los íconos reales del
// Historial: emojis de comida en los chips + el calendario lucide. No usar los
// glyphs propios (sol/pez/taza/luna) para las comidas.
import { CalendarDays } from "lucide-react";
// [P1-CLINICAL-MEAL-COUNT · 2026-06-27] Emoji por SLOT (no por índice) — planes de 3/5/6 comidas.
import { mealEmojiFor } from "../../utils/mealEmoji";

/**
 * HistoryDesktopPanel — vista "Historial" de escritorio (MealfitRD).
 *
 * [P3-HIST-DESKTOP-REDESIGN · 2026-06-24] Diseño aportado por el owner
 * (HistorialPanel) injertado sobre el Historial real: SOLO el panel (el sidebar
 * lo provee DashboardLayout) y cableado a datos/handlers reales. El modal de
 * detalle sigue siendo el real (History.jsx) — aquí solo es la LISTA. Móvil usa
 * el render compacto existente; esto es prop-driven y solo se monta en PC.
 *
 * Props:
 *   plans         Plan[] (crudos del backend)
 *   total         number — total de planes (para la pastilla del header)
 *   activePlanId  string|null — id del plan activo (hero)
 *   searchQuery, setSearchQuery
 *   onOpen(rawPlan)   — abre el modal de detalle REAL
 *   onEdit(rawPlan)   — inicia rename (el real)
 *   onDelete(rawPlan) — pide confirmación de borrado (el real)
 *   editingId, tempName, setTempName, onEditSave(rawPlan), onEditCancel()
 */

/* ---------------------------------------------------------------- iconos */
const PATHS = {
  cal: "M7 3v3M17 3v3M4 8h16M5 6h14v15H5z",
  search: "M20 20l-3.2-3.2",
  clock: "M12 7v5l3.5 2",
  pencil: "M4 20h4L18 10l-4-4L4 16v4ZM14 6l4 4",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  chev: "M9 6l6 6-6 6",
  check: "M20 6 9 17l-5-5",
  flame: "M12 3s5 4 5 9a5 5 0 0 1-10 0c0-1.5.6-2.8 1.3-3.8C9 9.6 12 8 12 3Z",
  refresh: "M21 12a9 9 0 1 1-2.6-6.4M21 3v5h-5",
  x: "M6 6l12 12M18 6 6 18",
  sun: "M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4",
  fish: "M2 12c3-5 8-6 13-6 4 0 7 3 7 6s-3 6-7 6c-5 0-10-1-13-6Z",
  cup: "M18 8h1a3 3 0 0 1 0 6h-1M4 8h14v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8ZM7 2v2M11 2v2",
  moon: "M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z",
};
function Icon({ name, size = 20 }) {
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" };
  const extra = {
    search: <circle cx="11" cy="11" r="7" {...stroke} />,
    clock: <circle cx="12" cy="12" r="9" {...stroke} />,
    fish: <circle cx="8" cy="11" r="1" {...stroke} />,
  }[name];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block" }} aria-hidden="true">
      {extra}
      {PATHS[name] && <path d={PATHS[name]} {...stroke} />}
    </svg>
  );
}

/* --------------------------------------------------------- helpers */
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const fmtDate = (d) => `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
const fmtTime = (d) => { let h = d.getHours(); const ap = h < 12 ? "a. m." : "p. m."; h = h % 12 || 12; return `${h}:${String(d.getMinutes()).padStart(2, "0")} ${ap}`; };
const daysAgo = (d) => Math.floor((Date.now() - d.getTime()) / 86400000);
function bucketOf(d) { const n = daysAgo(d); if (n <= 0) return "Hoy"; if (n === 1) return "Ayer"; if (n <= 6) return "Esta semana"; if (n <= 13) return "La semana pasada"; return "Más antiguos"; }
const BUCKET_ORDER = ["Hoy", "Ayer", "Esta semana", "La semana pasada", "Más antiguos"];
const parseGrams = (v) => { const n = parseInt(String(v ?? ""), 10); return Number.isFinite(n) ? n : 0; };

function normalizePlan(raw, activePlanId) {
  const rawMeals = Array.isArray(raw.preview_meals)
    ? raw.preview_meals
    : (raw.plan_data?.days?.[0]?.meals || raw.plan_data?.meals || raw.plan_data?.perfectDay || []);
  const meals = (Array.isArray(rawMeals) ? rawMeals : [])
    .filter((m) => m && m.name && !m.isSkipped)
    .map((m) => ({ name: m.name, emoji: mealEmojiFor(m.meal) }));
  return {
    raw,
    id: String(raw.id),
    name: raw.name || "Plan Generado",
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
  // [P2-DESIGN-CONSISTENCY · 2026-07-07] Paleta de macros alineada con Recetas
  // (canónica): Proteína=verde --secondary, Carbos=índigo --primary, Grasa=rosa
  // --accent. Antes P/C estaban intercambiados (P azul, C verde) vs Recetas.
  if (!t) return [["#34D399", 0], ["#818CF8", 0], ["#FB7185", 0]];
  return [["#34D399", kc.p / t], ["#818CF8", kc.c / t], ["#FB7185", kc.g / t]];
}

/* --------------------------------------------------------- piezas */
function MacroBar({ macros, legend = true }) {
  const seg = macroSplit(macros);
  const hasData = macros.p || macros.c || macros.g;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: legend ? 200 : 0, flex: legend ? undefined : 1 }}>
      <span style={{ display: "flex", height: legend ? 8 : 7, borderRadius: 99, overflow: "hidden", background: "var(--bg-muted)" }}>
        {seg.map(([c, w], i) => <i key={i} style={{ width: `${(w * 100).toFixed(1)}%`, background: c }} />)}
      </span>
      {legend && hasData && (
        <div style={{ display: "flex", gap: 13 }}>
          {[["#34D399", "P", macros.p], ["#818CF8", "C", macros.c], ["#FB7185", "G", macros.g]].map(([c, l, v]) => (
            <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: ".7rem", fontWeight: 700, color: "var(--text-muted)" }}>
              <i style={{ width: 8, height: 8, borderRadius: 3, background: c }} /> {l} <b style={{ color: "var(--text-main)" }}>{v}g</b>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function RecipeChips({ meals, max }) {
  if (!meals.length) return null;
  const shown = meals.slice(0, max);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 8 }}>
      {shown.map((m, i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: ".76rem", fontWeight: 600,
          color: "var(--text-main)", background: "var(--bg-card)", border: "1px solid var(--border)", padding: "5px 10px 5px 6px", borderRadius: 99, maxWidth: 230 }}>
          <span style={{ width: 20, height: 20, borderRadius: 6, flex: "none", display: "grid", placeItems: "center", fontSize: 12, background: "var(--bg-muted)" }}>
            {m.emoji}
          </span>
          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</span>
        </span>
      ))}
      {meals.length > max && (
        <span style={{ display: "inline-flex", alignItems: "center", fontSize: ".76rem", fontWeight: 600, color: "var(--text-muted)",
          background: "var(--bg-card)", border: "1px solid var(--border)", padding: "5px 11px", borderRadius: 99 }}>+{meals.length - max}</span>
      )}
    </div>
  );
}

function IconButton({ name, danger, title, onClick }) {
  const [h, setH] = useState(false);
  const dangerHover = danger && h;
  return (
    <button type="button" title={title} onClick={(e) => { e.stopPropagation(); onClick && onClick(); }}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", cursor: "pointer", appearance: "none",
        color: dangerHover ? "var(--danger-text)" : h ? "var(--text-main)" : "var(--text-light)",
        background: dangerHover ? "color-mix(in srgb, var(--danger) 12%, transparent)" : h ? "var(--bg-muted)" : "transparent",
        border: `1px solid ${dangerHover ? "color-mix(in srgb, var(--danger) 35%, transparent)" : h ? "var(--border)" : "transparent"}`, transition: ".15s" }}>
      <Icon name={name} size={16} />
    </button>
  );
}

/* Rename inline (reusa el flujo real: editingId / tempName / save / cancel) */
function NameEditor({ tempName, setTempName, onSave, onCancel, big }) {
  return (
    <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 7, flex: 1, minWidth: 0 }}>
      <input
        autoFocus
        value={tempName}
        onChange={(e) => setTempName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onSave(); if (e.key === "Escape") onCancel(); }}
        style={{ flex: 1, minWidth: 0, appearance: "none", font: "inherit", fontFamily: "var(--font-heading)", fontWeight: 800,
          fontSize: big ? "1.2rem" : "1rem", color: "var(--text-main)", background: "var(--bg-card)", border: "1px solid var(--primary)",
          borderRadius: 9, padding: "6px 10px", outline: "none" }}
      />
      <IconButton name="check" title="Guardar" onClick={onSave} />
      <IconButton name="x" title="Cancelar" onClick={onCancel} />
    </div>
  );
}

function PlanHero({ plan, onOpen, onEdit, editing, tempName, setTempName, onEditSave, onEditCancel }) {
  return (
    <div onClick={onOpen} style={{ position: "relative", overflow: "hidden", borderRadius: 20, padding: 20, cursor: "pointer",
      border: "1px solid color-mix(in srgb, var(--secondary) 40%, var(--border))",
      background: "linear-gradient(135deg, color-mix(in srgb, var(--secondary) 14%, transparent), transparent 55%), var(--bg-page)" }}>
      <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: "linear-gradient(var(--secondary), color-mix(in srgb, var(--secondary) 40%, transparent))" }} />
      <div style={{ display: "flex", alignItems: "flex-start", gap: 15 }}>
        <span style={emblem(50)}><CalendarDays size={25} strokeWidth={2.25} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", fontSize: ".62rem", fontWeight: 800,
            letterSpacing: ".07em", textTransform: "uppercase", color: "var(--secondary)", background: "color-mix(in srgb, var(--secondary) 16%, transparent)",
            border: "1px solid color-mix(in srgb, var(--secondary) 36%, transparent)", padding: "4px 10px", borderRadius: 99 }}>
            <i style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--secondary)", boxShadow: "0 0 8px var(--secondary)" }} /> Plan activo
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 9, margin: "9px 0 3px", fontFamily: "var(--font-heading)", fontSize: "1.3rem", fontWeight: 800, letterSpacing: "-.015em", color: "var(--text-main)" }}>
            {editing ? (
              <NameEditor tempName={tempName} setTempName={setTempName} onSave={onEditSave} onCancel={onEditCancel} big />
            ) : (
              <>
                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{plan.name}</span>
                <span onClick={(e) => { e.stopPropagation(); onEdit && onEdit(); }} title="Renombrar" style={{ color: "var(--text-light)", cursor: "pointer", display: "grid" }}><Icon name="pencil" size={15} /></span>
              </>
            )}
          </div>
          <div style={metaRow}><Icon name="clock" size={13} /> {fmtDate(plan.date)} · {fmtTime(plan.date)}</div>
          <RecipeChips meals={plan.meals} max={4} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
          {plan.kcal > 0 && <span style={kcalBig}><b style={{ fontSize: "1.5rem", color: "#FB923C" }}>{plan.kcal.toLocaleString("es-DO")}</b><span>kcal/día</span></span>}
          <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(); }} style={btn("primary")}><Icon name="chev" size={16} /> Ver plan</button>
        </div>
      </div>
      {(plan.macros.p || plan.macros.c || plan.macros.g) ? (
        <div style={{ marginTop: 16, maxWidth: 340 }}><MacroBar macros={plan.macros} /></div>
      ) : null}
    </div>
  );
}

function PlanRow({ plan, onOpen, onEdit, onDelete, editing, tempName, setTempName, onEditSave, onEditCancel }) {
  const [h, setH] = useState(false);
  return (
    <div onClick={onOpen} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: 16, padding: "14px 16px", borderRadius: 16, cursor: "pointer",
        border: `1px solid ${h ? "color-mix(in srgb, var(--primary) 45%, var(--border))" : "var(--border)"}`,
        background: h ? "color-mix(in srgb, var(--primary) 5%, transparent)" : "var(--bg-page)",
        transform: h ? "translateY(-1px)" : "none", transition: ".15s" }}>
      <span style={emblem(44)}><CalendarDays size={22} strokeWidth={2.25} /></span>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          {editing ? (
            <NameEditor tempName={tempName} setTempName={setTempName} onSave={onEditSave} onCancel={onEditCancel} />
          ) : (
            <>
              <span style={{ fontFamily: "var(--font-heading)", fontSize: "1rem", fontWeight: 800, letterSpacing: "-.01em", color: "var(--text-main)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{plan.name}</span>
              <span onClick={(e) => { e.stopPropagation(); onEdit && onEdit(); }} title="Renombrar" style={{ color: "var(--text-light)", cursor: "pointer", display: "grid" }}><Icon name="pencil" size={14} /></span>
              <span style={{ fontSize: ".74rem", color: "var(--text-light)", whiteSpace: "nowrap" }}>· {fmtTime(plan.date)}</span>
            </>
          )}
        </div>
        <RecipeChips meals={plan.meals} max={3} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {(plan.macros.p || plan.macros.c || plan.macros.g) ? <MacroBar macros={plan.macros} /> : <span />}
        {plan.kcal > 0 && <span style={{ ...kcalBig, gap: 4 }}><b style={{ fontSize: "1.1rem", color: "#FB923C" }}>{plan.kcal.toLocaleString("es-DO")}</b><span>kcal</span></span>}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <IconButton name="pencil" title="Renombrar" onClick={() => onEdit && onEdit()} />
          <IconButton name="trash" danger title="Eliminar" onClick={() => onDelete && onDelete()} />
          <span style={{ color: "var(--text-light)", display: "grid" }}><Icon name="chev" size={18} /></span>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- panel raíz */
export default function HistoryDesktopPanel({
  plans = [],
  total = 0,
  activePlanId = null,
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
  const [sort, setSort] = useState("recent");
  const q = searchQuery.trim().toLowerCase();

  const normalized = useMemo(() => plans.map((p) => normalizePlan(p, activePlanId)), [plans, activePlanId]);
  const active = normalized.find((p) => p.active);

  const rest = useMemo(() => {
    let arr = normalized.filter((p) => !p.active && (!q || p.name.toLowerCase().includes(q)));
    if (sort === "kcal") arr = [...arr].sort((a, b) => b.kcal - a.kcal);
    else if (sort === "name") arr = [...arr].sort((a, b) => a.name.localeCompare(b.name, "es"));
    else arr = [...arr].sort((a, b) => b.date - a.date);
    return arr;
  }, [normalized, q, sort]);

  const groups = useMemo(() => {
    const g = {};
    rest.forEach((p) => { (g[bucketOf(p.date)] = g[bucketOf(p.date)] || []).push(p); });
    return g;
  }, [rest]);

  const editProps = (p) => ({
    editing: editingId != null && String(editingId) === p.id,
    tempName,
    setTempName,
    onEditSave: () => onEditSave(p.raw),
    onEditCancel,
  });

  const noResults = q && rest.length === 0 && !(active && active.name.toLowerCase().includes(q));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, fontFamily: "var(--font-body)", color: "var(--text-main)", paddingBottom: 40 }}>
      {/* Header: título + pastilla + búsqueda */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-.02em", margin: 0 }}>Mi Bitácora</h1>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, whiteSpace: "nowrap", fontFamily: "var(--font-heading)", fontSize: ".74rem", fontWeight: 700,
          color: "var(--primary)", background: "color-mix(in srgb, var(--primary) 13%, transparent)", border: "1px solid color-mix(in srgb, var(--primary) 28%, transparent)", padding: "5px 12px", borderRadius: 99 }}>
          <Icon name="cal" size={13} /> {total} {total === 1 ? "plan nutricional" : "planes nutricionales"}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 9, background: "var(--bg-page)", border: "1px solid var(--border)", borderRadius: 13, padding: "9px 14px", minWidth: 240, color: "var(--text-light)" }}>
          <Icon name="search" size={16} />
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Buscar planes…"
            style={{ appearance: "none", border: 0, background: "transparent", font: "inherit", fontSize: ".86rem", color: "var(--text-main)", width: "100%", outline: "none" }} />
        </div>
      </div>

      {/* Ordenar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: ".72rem", fontWeight: 600, color: "var(--text-light)" }}>Ordenar:</span>
        <div style={{ display: "inline-flex", gap: 3, padding: 3, borderRadius: 11, background: "var(--bg-muted)", border: "1px solid var(--border)" }}>
          {[["recent", "Recientes"], ["kcal", "Calorías"], ["name", "Nombre"]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setSort(k)} aria-pressed={sort === k}
              style={{ appearance: "none", border: 0, cursor: "pointer", fontFamily: "var(--font-body)", fontSize: ".74rem", fontWeight: 700, padding: "7px 14px", borderRadius: 8,
                color: sort === k ? "var(--text-main)" : "var(--text-muted)", background: sort === k ? "var(--bg-card)" : "transparent", boxShadow: sort === k ? "0 1px 3px rgba(0,0,0,.35)" : "none" }}>{l}</button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {active && (!q || active.name.toLowerCase().includes(q)) && (
          <PlanHero
            plan={active}
            onOpen={() => onOpen(active.raw)}
            onEdit={() => onEdit(active.raw)}
            {...editProps(active)}
          />
        )}

        {BUCKET_ORDER.filter((g) => groups[g]).map((g) => (
          <div key={g} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "2px 2px" }}>
              <span style={{ fontFamily: "var(--font-heading)", fontSize: ".74rem", fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text-light)" }}>{g}</span>
              <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
              <span style={{ fontSize: ".7rem", fontWeight: 700, color: "var(--text-light)" }}>{groups[g].length}</span>
            </div>
            {groups[g].map((p) => (
              <PlanRow
                key={p.id}
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
          /* [P2-DESIGN-CONSISTENCY · 2026-07-07] Empty state = card con borde punteado,
             mismo lenguaje que Recetas (.empty) y Nevera. */
          <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-muted)", border: "1px dashed var(--border)", background: "var(--bg-page)", borderRadius: 16 }}>
            <Icon name="search" size={28} />
            <p style={{ marginTop: 10 }}>Sin resultados para <strong style={{ color: "var(--text-main)" }}>“{searchQuery.trim()}”</strong></p>
            <button type="button" onClick={() => setSearchQuery("")} style={{ ...btn("ghost"), marginTop: 8 }}>Limpiar búsqueda</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------- estilos compartidos */
const emblem = (s) => ({ flex: "none", width: s, height: s, borderRadius: s >= 50 ? 14 : 12, display: "grid", placeItems: "center", color: "#fff",
  background: "linear-gradient(150deg, var(--primary-light), var(--primary))", boxShadow: "0 10px 22px -10px var(--primary)" });
const metaRow = { display: "flex", alignItems: "center", gap: 7, fontSize: ".8rem", color: "var(--text-muted)" };
const kcalBig = { display: "inline-flex", alignItems: "baseline", gap: 5, fontFamily: "var(--font-heading)", fontWeight: 800, color: "var(--text-main)", whiteSpace: "nowrap" };
function btn(variant) {
  const base = { appearance: "none", cursor: "pointer", font: "inherit", fontWeight: 700, fontSize: ".84rem", display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 13, border: "1px solid transparent", transition: ".15s" };
  // [P2-DESIGN-CONSISTENCY · 2026-07-07] CTA primario igual que Recetas (.primary)
  // y Nevera (.add): gradiente primary-light→primary con texto oscuro.
  if (variant === "primary") return { ...base, color: "#0B1120", background: "linear-gradient(120deg, var(--primary-light), var(--primary))", boxShadow: "0 8px 20px -8px var(--primary)" };
  return { ...base, color: "var(--text-main)", background: "var(--bg-muted)", border: "1px solid var(--border)" };
}
