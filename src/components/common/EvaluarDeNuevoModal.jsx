import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";

/**
 * EvaluarDeNuevoModal — "Evaluar de Nuevo"
 * Modal de selección + confirmación para regenerar el plan (MealfitRD).
 * Diseño del owner, tokens del DS (tema claro/oscuro automático), SIN emoji ✨.
 *
 * Patrón "elige y confirma": el usuario elige una de dos vías (radio) y pulsa el
 * ÚNICO botón de confirmar (refleja la opción elegida). La X de arriba cancela.
 *   • Renovar plan actual → vía recomendada (índigo, var(--primary)).
 *   • Empezar desde cero  → vía destructiva (var(--danger)). El botón se vuelve rojo.
 *
 * Añadidos para integrarlo como modal real: backdrop + portal a <body>, ESC +
 * click-fuera + scroll-lock, y prop `busy` para el loading durante la acción.
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
    tag: { type: "danger", label: "Borra todo" },
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

/* --------------------------------------------------------- fila seleccionable */
function ChoiceRow({ choice, selected, disabled, onSelect }) {
  const [hover, setHover] = useState(false);
  const accent = choice.destructive ? "var(--danger)" : "var(--primary)";

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={() => onSelect(choice.id)}
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
        background: selected ? `color-mix(in srgb, ${accent} 8%, transparent)` : "var(--bg-card)",
        border: `1.5px solid ${
          selected ? accent : hover && !disabled ? "color-mix(in srgb, var(--text-muted) 40%, transparent)" : "var(--border)"
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
          border: `2px solid ${selected ? accent : "var(--border)"}`,
          transition: "border-color .15s",
        }}
      >
        {selected && <span style={{ width: 10, height: 10, borderRadius: "50%", background: accent }} />}
      </span>

      {/* cuerpo */}
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "nowrap", minWidth: 0 }}>
          <span style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: ".98rem", color: "var(--text-main)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
            {choice.title}
          </span>
          <Tag tag={choice.tag} />
        </span>
        <span style={{ fontSize: ".78rem", lineHeight: 1.4, fontWeight: 500, color: "var(--text-muted)" }}>
          {choice.desc}
        </span>
      </span>
    </button>
  );
}

/* --------------------------------------------------- botón confirmar (único) */
function ConfirmButton({ destructive, label, busy, busyLabel, onClick }) {
  const [hover, setHover] = useState(false);
  const accent = destructive ? "var(--danger)" : "var(--primary)";
  const accentHover = destructive ? "var(--danger)" : "var(--primary-dark)";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      style={{
        width: "100%",
        appearance: "none",
        font: "inherit",
        cursor: busy ? "wait" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 14,
        borderRadius: 14,
        border: "none",
        fontFamily: "var(--font-heading)",
        fontWeight: 700,
        fontSize: ".95rem",
        // Texto sobre relleno de acento: la superficie como color contrasta en
        // ambos temas (oscuro → texto oscuro, claro → texto blanco).
        color: "var(--bg-card)",
        background: busy ? accent : hover ? accentHover : accent,
        opacity: busy ? 0.85 : 1,
        filter: destructive && hover && !busy ? "brightness(.96)" : "none",
        transform: hover && !busy ? "translateY(-1px)" : "none",
        boxShadow: hover && !busy ? `0 14px 26px -14px ${accent}` : "none",
        transition: "background .16s, transform .16s, box-shadow .16s, filter .16s",
      }}
    >
      {busy ? busyLabel : label}
    </button>
  );
}

/* ============================================================ componente raíz */
export default function EvaluarDeNuevoModal({
  open = true,
  title = "Evaluar de Nuevo",
  subtitle = "Elige cómo generar tu nuevo plan.",
  choices = DEFAULT_CHOICES,
  defaultChoice = "renovar",
  busy = false,
  onConfirm = () => {},
  onClose = () => {},
}) {
  const [selected, setSelected] = useState(defaultChoice);

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

  if (!open) return null;

  const current = choices.find((c) => c.id === selected) || choices[0];
  const destructive = !!current.destructive;

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
        {/* cerrar (reemplaza a "Cancelar") */}
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

        {/* opciones (radio) */}
        <div role="radiogroup" aria-label={title} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
          {choices.map((c) => (
            <ChoiceRow key={c.id} choice={c} selected={c.id === selected} disabled={busy} onSelect={setSelected} />
          ))}
        </div>

        {/* botón ÚNICO de confirmar (refleja la opción elegida) */}
        <div style={{ marginTop: 18 }}>
          <ConfirmButton
            destructive={destructive}
            label={destructive ? "Empezar desde cero" : "Generar plan"}
            busy={busy}
            busyLabel={destructive ? "Borrando…" : "Generando…"}
            onClick={() => { if (!busy) onConfirm(selected); }}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
