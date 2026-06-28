import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";

/**
 * EvaluarDeNuevoModal — "Evaluar de Nuevo"
 * Modal de selección + confirmación para regenerar el plan (MealfitRD).
 * Diseño aportado por el owner. Patrón "elige y confirma": dos vías + un CTA que
 * refleja la opción elegida. Renovar = índigo (var(--primary)); Empezar desde cero
 * = destructiva (var(--danger)). Estilizado 100% con tokens del DS → tema claro/
 * oscuro automático. SIN emoji ✨ en el CTA (pedido del owner).
 *
 * Añadidos sobre el diseño base (para integrarlo como modal real):
 *   - Backdrop/overlay fijo + centrado, click-fuera + ESC para cerrar, scroll-lock.
 *   - Prop `busy`: deshabilita acciones y muestra label de carga mientras corre la
 *     acción async (regenerar / borrar).
 */

/* ----------------------------------------------------------------- iconos */
function Icon({ name, size = 20, stroke = 2 }) {
  const base = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: stroke,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    style: { display: "block", flex: "none" },
  };
  switch (name) {
    case "chef":
      return (
        <svg {...base}>
          <path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z" />
          <path d="M6 17h12" />
        </svg>
      );
    case "check":
      return (
        <svg {...base}>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      );
    case "alert":
      return (
        <svg {...base}>
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
      );
    case "close":
      return (
        <svg {...base}>
          <path d="M18 6 6 18" />
          <path d="M6 6l12 12" />
        </svg>
      );
    default:
      return null;
  }
}

/* ---------------------------------------------------------- datos por defecto */
const DEFAULT_CHOICES = [
  {
    id: "renovar",
    title: "Renovar plan actual",
    desc: "Genera platos nuevos con los datos que ya configuraste.",
    tag: { type: "rec", label: "Recomendado" },
  },
  {
    id: "cero",
    title: "Empezar desde cero",
    desc: "Te lleva al formulario inicial y elimina tu plan actual.",
    tag: { type: "danger", label: "Borra tu progreso" },
    destructive: true,
  },
];

/* ----------------------------------------------------------------- etiqueta */
function Tag({ tag }) {
  if (!tag) return null;
  const danger = tag.type === "danger";
  const accent = danger ? "var(--danger)" : "var(--primary)";
  return (
    <span
      style={{
        display: "inline-flex",
        flex: "none",
        alignItems: "center",
        gap: 5,
        padding: "4px 9px",
        borderRadius: 999,
        fontSize: ".62rem",
        fontWeight: 800,
        letterSpacing: ".05em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        color: danger ? "var(--danger-text)" : "var(--primary)",
        background: `color-mix(in srgb, ${accent} 15%, transparent)`,
        border: `1px solid color-mix(in srgb, ${accent} 34%, transparent)`,
      }}
    >
      <Icon name={danger ? "alert" : "check"} size={11} stroke={danger ? 2.2 : 3} />
      {tag.label}
    </span>
  );
}

/* ----------------------------------------------------- fila = acción directa */
function ChoiceRow({ choice, active, disabled, busyLabel, onClick }) {
  const [hover, setHover] = useState(false);
  const accent = choice.destructive ? "var(--danger)" : "var(--primary)";
  const confirming = active && choice.destructive;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      style={{
        appearance: "none",
        font: "inherit",
        color: "inherit",
        textAlign: "left",
        cursor: disabled ? "default" : "pointer",
        width: "100%",
        display: "flex",
        gap: 13,
        alignItems: "flex-start",
        padding: 14,
        borderRadius: 16,
        background: active ? `color-mix(in srgb, ${accent} 8%, transparent)` : "var(--bg-card)",
        border: `1.5px solid ${
          active ? accent : hover && !disabled ? "color-mix(in srgb, var(--text-muted) 40%, transparent)" : "var(--border)"
        }`,
        transition: "border-color .15s, background .15s",
      }}
    >
      {/* radio */}
      <span
        style={{
          flex: "none",
          width: 20,
          height: 20,
          marginTop: 2,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          border: `2px solid ${active ? accent : "var(--border)"}`,
          transition: "border-color .15s",
        }}
      >
        {active && <span style={{ width: 10, height: 10, borderRadius: "50%", background: accent }} />}
      </span>

      {/* cuerpo */}
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "nowrap", minWidth: 0 }}>
          <span style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: ".98rem", color: "var(--text-main)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
            {choice.title}
          </span>
          <Tag tag={choice.tag} />
        </span>
        <span style={{ fontSize: ".78rem", lineHeight: 1.4, fontWeight: confirming || busyLabel ? 700 : 500, color: confirming ? "var(--danger-text)" : "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: 6 }}>
          {confirming && !busyLabel && <Icon name="alert" size={13} stroke={2.4} />}
          {busyLabel || (confirming ? "Toca de nuevo para borrar todo y volver al formulario." : choice.desc)}
        </span>
      </span>
    </button>
  );
}

/* ============================================================ componente raíz */
export default function EvaluarDeNuevoModal({
  open = true,
  title = "Evaluar de Nuevo",
  subtitle = "Elige cómo generar tu nuevo plan.",
  choices = DEFAULT_CHOICES,
  busy = false,
  onConfirm = () => {},
  onClose = () => {},
}) {
  // `armed` = id de la opción destructiva a la espera del 2º toque; `actingId` =
  // opción cuya acción está corriendo (para mostrar su loading).
  const [armed, setArmed] = useState(null);
  const [actingId, setActingId] = useState(null);

  // ESC para cerrar + bloqueo del scroll del body mientras está abierto.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, busy, onClose]);

  // Resetea el estado "armado" al cerrar (el componente no se desmonta entre usos).
  useEffect(() => {
    if (!open) { setArmed(null); setActingId(null); }
  }, [open]);

  if (!open) return null;

  const activate = (choice) => {
    if (busy) return;
    // Destructivo: el 1er toque ARMA la confirmación; el 2º ejecuta. El resto
    // (renovar) actúa al instante. La X de arriba reemplaza a "Cancelar".
    if (choice.destructive && armed !== choice.id) {
      setArmed(choice.id);
      return;
    }
    setArmed(null);
    setActingId(choice.id);
    onConfirm(choice.id);
  };

  // Portal a <body>: garantiza que el overlay fixed cubra el viewport aunque algún
  // ancestro de la página tenga transform/filter (que romperían position:fixed).
  return createPortal(
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "grid",
        placeItems: "center",
        padding: 16,
        background: "rgba(2, 6, 23, 0.55)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        animation: "fadeSlideDown .18s ease",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="evaluar-title"
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 404,
          boxSizing: "border-box",
          padding: 22,
          borderRadius: 24,
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          boxShadow: "0 30px 70px -28px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.02)",
          fontFamily: "var(--font-body)",
          color: "var(--text-main)",
          animation: "fadeSlideDown .2s ease",
        }}
      >
        {/* cerrar */}
        <button
          type="button"
          onClick={() => { if (!busy) onClose(); }}
          aria-label="Cerrar"
          disabled={busy}
          style={{
            position: "absolute",
            top: 15,
            right: 15,
            width: 34,
            height: 34,
            display: "grid",
            placeItems: "center",
            borderRadius: 10,
            cursor: busy ? "default" : "pointer",
            color: "var(--text-muted)",
            background: "transparent",
            border: "1px solid transparent",
          }}
        >
          <Icon name="close" size={19} stroke={2} />
        </button>

        {/* cabecera */}
        <div style={{ display: "flex", alignItems: "center", gap: 13, paddingRight: 40 }}>
          <span
            style={{
              flex: "none",
              width: 48,
              height: 48,
              borderRadius: 14,
              display: "grid",
              placeItems: "center",
              color: "#FFFFFF",
              background: "linear-gradient(150deg, var(--primary), var(--primary-dark))",
              boxShadow: "0 12px 22px -12px var(--primary)",
            }}
          >
            <Icon name="chef" size={25} stroke={1.8} />
          </span>
          <h2
            id="evaluar-title"
            style={{
              margin: 0,
              fontFamily: "var(--font-heading)",
              fontWeight: 800,
              fontSize: "1.32rem",
              letterSpacing: "-.02em",
              lineHeight: 1.08,
              color: "var(--text-main)",
            }}
          >
            {title}
          </h2>
        </div>

        <p style={{ margin: "12px 0 0", fontSize: ".86rem", lineHeight: 1.5, fontWeight: 500, color: "var(--text-muted)" }}>
          {subtitle}
        </p>

        {/* opciones = acciones directas (un toque). El destructivo pide un 2º toque. */}
        <div role="group" aria-label={title} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
          {choices.map((c) => (
            <ChoiceRow
              key={c.id}
              choice={c}
              active={armed === c.id}
              disabled={busy}
              busyLabel={busy && actingId === c.id ? (c.destructive ? "Borrando…" : "Generando tu plan…") : null}
              onClick={() => activate(c)}
            />
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
