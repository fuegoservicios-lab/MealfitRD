import React, { useEffect } from "react";
import { createPortal } from "react-dom";

/**
 * PantryConsentModal — "Nevera estricta + consentimiento" [P1-PANTRY-STRICT-CONSENT · 2026-08-02]
 *
 * Decisión del owner: tras la compra inicial, los cambios de plato (Cambiar Plato /
 * Actualizar día / Arreglar este día) cocinan SOLO de la Nevera física por default. Si
 * el chef no encuentra una alternativa nevera-only, el backend responde
 * `needs_new_ingredients` (nombre + cantidad + precio RD$ estimado por ingrediente) en
 * vez de introducirlo en silencio. Este modal es el punto de consentimiento: nombra lo
 * que falta y ofrece 3 salidas honestas — nunca escribe nada sin que el usuario elija.
 *
 * Mismo lenguaje visual que EvaluarDeNuevoModal.jsx (portal a <body>, overlay + panel,
 * tokens del DS, tema claro/oscuro automático vía var(--*)).
 */

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
    case "fridge":
      return (
        <svg {...base}>
          <rect x="5" y="2" width="14" height="20" rx="2" />
          <path d="M5 10h14" />
          <path d="M8 5v2" />
          <path d="M8 13v2" />
        </svg>
      );
    case "cart":
      return (
        <svg {...base}>
          <circle cx="9" cy="20" r="1.4" />
          <circle cx="18" cy="20" r="1.4" />
          <path d="M2.5 3h2l2.6 12.6a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L21 7H6" />
        </svg>
      );
    case "shuffle":
      return (
        <svg {...base}>
          <path d="M17 3h4v4" />
          <path d="M3 21 21 3" />
          <path d="M21 17v4h-4" />
          <path d="M3 3l6.5 6.5" />
          <path d="M14.5 14.5 21 21" />
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

function formatQty(m) {
  const qty = Number(m?.qty_needed);
  if (!qty || Number.isNaN(qty)) return "";
  const unit = m?.unit ? String(m.unit) : "";
  const qtyTxt = Number.isInteger(qty) ? String(qty) : qty.toFixed(1);
  return `${qtyTxt} ${unit}`.trim();
}

function formatPrice(m) {
  const price = Number(m?.est_price_rd);
  if (!price || Number.isNaN(price) || price <= 0) return null;
  return `~RD$${Math.round(price)}`;
}

function IngredientRow({ item }) {
  const qtyTxt = formatQty(item);
  const priceTxt = formatPrice(item);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 12,
        background: "var(--bg-muted)",
        border: "1px solid var(--border)",
      }}
    >
      <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <span
          style={{
            fontFamily: "var(--font-heading)",
            fontWeight: 700,
            fontSize: ".92rem",
            color: "var(--text-main)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item?.name || "Ingrediente"}
        </span>
        {qtyTxt && (
          <span style={{ fontSize: ".76rem", color: "var(--text-muted)", fontWeight: 500 }}>{qtyTxt}</span>
        )}
      </span>
      {priceTxt ? (
        <span
          style={{
            flex: "none",
            fontFamily: "var(--font-heading)",
            fontWeight: 800,
            fontSize: ".86rem",
            color: "var(--primary)",
            whiteSpace: "nowrap",
          }}
        >
          {priceTxt}
        </span>
      ) : (
        <span style={{ flex: "none", fontSize: ".76rem", color: "var(--text-light)" }}>precio no disp.</span>
      )}
    </div>
  );
}

const PCM_CSS = `
@keyframes pcmFadeIn { from { opacity: 0; } to { opacity: 1; } }
@media (max-width: 600px) {
  .pcm-overlay { place-items: end stretch !important; padding: 0 !important; }
  .pcm-panel {
    max-width: 100% !important; width: 100% !important;
    border-radius: 22px 22px 0 0 !important; border-bottom: none !important;
    padding-bottom: calc(20px + env(safe-area-inset-bottom)) !important;
    max-height: 92vh !important; overflow-y: auto !important;
  }
}
@media (prefers-reduced-motion: reduce) {
  .pcm-overlay, .pcm-panel { animation: none !important; }
}
`;

export default function PantryConsentModal({
  open = false,
  missing = [],
  message = "",
  busy = false,
  onConfirm = () => {},
  onRetry = () => {},
  onClose = () => {},
}) {
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

  const names = (missing || []).map((m) => m?.name).filter(Boolean);

  return createPortal(
    <>
      <style>{PCM_CSS}</style>
      <div
        className="pcm-overlay"
        onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
        style={{
          position: "fixed",
          inset: 0,
          /* [P1-MODAL-OVER-DIALOG · 2026-08-10] 9999, no 1000, y por encima de la
             ventana de Configuración (9990). Con 1000 este modal se montaba
             DETRÁS de su backdrop opaco: el botón «Evaluar de nuevo» parecía
             muerto cuando en realidad funcionaba. Mismo valor que Modal.jsx —
             un modal está siempre en la capa de modales, no en una propia. */
            zIndex: 9999,
          display: "grid",
          placeItems: "center",
          padding: 16,
          background: "rgba(2, 6, 23, 0.55)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          animation: "pcmFadeIn .18s ease",
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pcm-title"
          className="pcm-panel"
          style={{
            position: "relative",
            width: "100%",
            maxWidth: 420,
            boxSizing: "border-box",
            padding: 22,
            borderRadius: 24,
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            boxShadow: "0 30px 70px -28px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.02)",
            fontFamily: "var(--font-body)",
            color: "var(--text-main)",
          }}
        >
          <button
            type="button"
            onClick={() => { if (!busy) onClose(); }}
            aria-label="Cerrar"
            disabled={busy}
            style={{
              position: "absolute", top: 15, right: 15, width: 34, height: 34,
              display: "grid", placeItems: "center", borderRadius: 10,
              cursor: busy ? "default" : "pointer", color: "var(--text-muted)",
              background: "transparent", border: "1px solid transparent",
            }}
          >
            <Icon name="close" size={19} stroke={2} />
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 13, paddingRight: 40 }}>
            <span
              style={{
                flex: "none", width: 48, height: 48, borderRadius: 14,
                display: "grid", placeItems: "center", color: "#FFFFFF",
                background: "linear-gradient(150deg, var(--primary), var(--primary-dark))",
                boxShadow: "0 12px 22px -12px var(--primary)",
              }}
            >
              <Icon name="fridge" size={24} stroke={1.8} />
            </span>
            <h2
              id="pcm-title"
              style={{
                margin: 0, fontFamily: "var(--font-heading)", fontWeight: 800,
                fontSize: "1.2rem", letterSpacing: "-.02em", lineHeight: 1.15,
                color: "var(--text-main)",
              }}
            >
              Tu Nevera no alcanza
            </h2>
          </div>

          <p style={{ margin: "12px 0 0", fontSize: ".86rem", lineHeight: 1.5, fontWeight: 500, color: "var(--text-muted)" }}>
            {message || `El chef necesita ${names.join(", ") || "un ingrediente"} que no está en tu Nevera.`}
          </p>

          {missing.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
              {missing.slice(0, 6).map((item, idx) => (
                <IngredientRow key={`${item?.name || "item"}-${idx}`} item={item} />
              ))}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
            <button
              type="button"
              onClick={() => { if (!busy) onConfirm(); }}
              disabled={busy}
              style={{
                width: "100%", appearance: "none", font: "inherit", cursor: busy ? "wait" : "pointer",
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                padding: 14, borderRadius: 14, border: "none",
                fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: ".92rem",
                color: "var(--bg-card)", background: "var(--primary)", opacity: busy ? 0.85 : 1,
              }}
            >
              <Icon name="cart" size={17} stroke={2} />
              {busy ? "Añadiendo…" : "Añadir a la lista y continuar"}
            </button>
            <button
              type="button"
              onClick={() => { if (!busy) onRetry(); }}
              disabled={busy}
              style={{
                width: "100%", appearance: "none", font: "inherit", cursor: busy ? "wait" : "pointer",
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                padding: 13, borderRadius: 14, border: "1.5px solid var(--border)",
                fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: ".9rem",
                color: "var(--text-main)", background: "var(--bg-card)", opacity: busy ? 0.7 : 1,
              }}
            >
              <Icon name="shuffle" size={16} stroke={2} />
              Buscar otra opción
            </button>
            <button
              type="button"
              onClick={() => { if (!busy) onClose(); }}
              disabled={busy}
              style={{
                width: "100%", appearance: "none", font: "inherit", cursor: busy ? "default" : "pointer",
                padding: 10, borderRadius: 12, border: "none", background: "transparent",
                fontFamily: "var(--font-body)", fontWeight: 600, fontSize: ".84rem",
                color: "var(--text-muted)",
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
