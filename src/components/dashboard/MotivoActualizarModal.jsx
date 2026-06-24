import React, { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useModalAccessibility } from "../../hooks/useModalAccessibility";

/**
 * MotivoActualizarModal — "¿Por qué quieres actualizar?"
 * Selector de motivo para regenerar los platos del día completo (MealfitRD).
 *
 * [P3-MOTIVO-MODAL-REDESIGN · 2026-06-24] Diseño aportado por el owner; injertado
 * sobre el flujo real de Dashboard (regenerateDay / cuota / dislike). Self-contained:
 * overlay + a11y vía useModalAccessibility (ESC, focus-trap, restore-focus,
 * backdrop-close). No usa el Modal compartido porque su botón de cerrar (top-right)
 * chocaría con la pastilla de cupo del header.
 *
 * [P3-MOTIVO-MODAL-MOBILE-SHEET · 2026-06-24] Responsive:
 *   - Escritorio: tarjeta centrada + bento (1 destacado + 2 tiles).
 *   - Móvil (≤768px): bottom-sheet (pegado abajo, drag handle, drag-to-close) con
 *     lista vertical de filas. Mismo contenido y handlers.
 *
 * Props:
 *   open, quota {left,total}, unlimited, options[], coming|null, pickingId, onPick, onClose
 */

/* --------------------------------------------------------- media query (SSR-safe) */
function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false
  );
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const m = window.matchMedia(query);
    setMatches(m.matches);
    const on = (e) => setMatches(e.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return matches;
}

/* ---------------------------------------------------------------- iconos */
const PATHS = {
  shuffle: "M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5",
  clock: "M12 7v5l3.5 2",
  // [P3-MOTIVO-MODAL-ICON-POLISH · 2026-06-24] Corazón simétrico (lucide) — el
  // path anterior tenía el hueco central descentrado y se veía "partido".
  heart:
    "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7l1-8Z",
  thumbDown:
    "M10 15v4a3 3 0 0 0 3 3l4-9V3H6.2a2 2 0 0 0-2 1.7l-1.4 9A2 2 0 0 0 4.8 16H10ZM17 3h3a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-3",
  star: "M12 3l2.6 5.7 6.2.6-4.7 4.1 1.4 6.1L12 16.9 6.5 19.6l1.4-6.1L3.2 9.3l6.2-.6L12 3Z",
  refresh: "M21 12a9 9 0 1 1-2.6-6.4M21 3v5h-5",
  chevron: "M9 6l6 6-6 6",
  copy: "M8 8h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z M4 16a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v9H5z",
  calendar: "M7 3v3M17 3v3M4 8h16M5 6h14v15H5z",
  check: "M20 6 9 17l-5-5",
};

function Icon({ name, size = 20, fill = "none" }) {
  const isCircle = name === "clock"; // el reloj necesita su círculo base
  const filled = fill !== "none";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={filled ? 1 : 1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: "block", flex: "none" }}
    >
      {isCircle && <circle cx="12" cy="12" r="9" />}
      <path d={PATHS[name]} />
    </svg>
  );
}

const DANGER = "#F87171";
const brightOf = (c) => `color-mix(in srgb, ${c}, #fff 42%)`;

/* ---------------------------------------------------------- spinner inline */
function Spinner({ size = 20 }) {
  return (
    <span style={{ display: "grid", color: "var(--primary)" }}>
      <span style={{ animation: "mfa-spin .8s linear infinite", display: "grid" }}>
        <Icon name="refresh" size={size} />
      </span>
      <style>{"@keyframes mfa-spin{to{transform:rotate(360deg)}}"}</style>
    </span>
  );
}

function LoadingOverlay() {
  return (
    <span
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 3,
        display: "grid",
        placeItems: "center",
        borderRadius: "inherit",
        background: "color-mix(in srgb, var(--bg-card) 55%, transparent)",
        backdropFilter: "blur(1px)",
      }}
    >
      <Spinner />
    </span>
  );
}

/* etiqueta "Más elegida" — reutilizada por bento + lista móvil */
function RecommendedBadge({ c, size = "md" }) {
  const accent = brightOf(c);
  const small = size === "sm";
  return (
    <span
      style={{
        alignSelf: "flex-start",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        marginBottom: small ? 3 : 13,
        padding: small ? "3px 8px" : "4px 9px",
        borderRadius: 99,
        fontSize: small ? ".52rem" : ".55rem",
        fontWeight: 800,
        letterSpacing: ".06em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        color: accent,
        background: `${c}40`,
        border: `1px solid ${c}85`,
      }}
    >
      <Icon name="star" size={small ? 10 : 11} fill={accent} /> Más elegida
    </span>
  );
}

/* --------------------------------------------------------------- tile / hero (bento, escritorio) */
function OptionTile({ option, hero, faded, loading, onPick }) {
  const [hover, setHover] = useState(false);
  const c = option.color;

  return (
    <button
      type="button"
      onClick={() => onPick(option.id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      style={{
        position: "relative",
        overflow: "hidden",
        appearance: "none",
        font: "inherit",
        textAlign: "left",
        cursor: "pointer",
        color: "inherit",
        display: "flex",
        flexDirection: "column",
        gridRow: hero ? "span 2" : undefined,
        padding: hero ? 16 : 14,
        borderRadius: 18,
        background: `linear-gradient(155deg, ${c}26, ${c}0D)`,
        border: `1.5px solid ${hover ? `${c}8C` : `${c}3D`}`,
        opacity: faded ? 0.42 : 1,
        filter: faded ? "saturate(.6)" : "none",
        transform: hover && !faded ? "translateY(-2px)" : "none",
        boxShadow: hover && !faded ? `0 14px 30px -16px ${c}D9` : "none",
        transition: "transform .14s, border-color .14s, box-shadow .14s, opacity .15s",
      }}
    >
      {option.recommended && <RecommendedBadge c={c} />}

      <span
        style={{
          width: hero ? 50 : 44,
          height: hero ? 50 : 44,
          borderRadius: hero ? 15 : 13,
          display: "grid",
          placeItems: "center",
          flex: "none",
          ...(hero
            ? { color: "#0B1120", background: `linear-gradient(150deg, ${c}, ${c})`, boxShadow: `0 10px 22px -10px ${c}` }
            : { color: c, background: `${c}33`, border: `1px solid ${c}52` }),
        }}
      >
        <Icon name={option.icon} size={hero ? 25 : 22} />
      </span>

      <span
        style={{
          fontFamily: "var(--font-heading)",
          fontWeight: 800,
          letterSpacing: "-.01em",
          lineHeight: 1.15,
          color: "var(--text-main)",
          fontSize: hero ? "1.16rem" : ".95rem",
          marginTop: hero ? 14 : 11,
        }}
      >
        {option.label}
      </span>

      <span
        style={{
          fontWeight: 500,
          lineHeight: 1.35,
          color: "var(--text-muted)",
          fontSize: hero ? ".82rem" : ".76rem",
          marginTop: hero ? 6 : 4,
        }}
      >
        {option.desc}
      </span>

      {hero && (
        <span
          style={{
            alignSelf: "flex-start",
            marginTop: "auto",
            width: 32,
            height: 32,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            color: hover ? "#0B1120" : c,
            background: hover ? c : `${c}1A`,
            border: `1.5px solid ${hover ? c : `${c}59`}`,
            transform: hover ? "translateX(2px)" : "none",
            transition: ".16s",
          }}
        >
          <Icon name="chevron" size={16} />
        </span>
      )}

      {loading && <LoadingOverlay />}
    </button>
  );
}

/* --------------------------------------------------------- fila horizontal (lista móvil) */
function OptionRow({ option, faded, loading, onPick }) {
  const [hover, setHover] = useState(false);
  const c = option.color;
  const rec = !!option.recommended;

  return (
    <button
      type="button"
      onClick={() => onPick(option.id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      style={{
        position: "relative",
        overflow: "hidden",
        appearance: "none",
        font: "inherit",
        textAlign: "left",
        cursor: "pointer",
        color: "inherit",
        display: "flex",
        alignItems: "center",
        gap: 13,
        width: "100%",
        padding: "13px 14px",
        borderRadius: 16,
        background: `linear-gradient(155deg, ${c}26, ${c}0D)`,
        border: `1.5px solid ${hover ? `${c}8C` : `${c}3D`}`,
        opacity: faded ? 0.42 : 1,
        transform: hover && !faded ? "translateY(-2px)" : "none",
        boxShadow: hover && !faded ? `0 14px 30px -16px ${c}D9` : "none",
        transition: "transform .14s, border-color .14s, box-shadow .14s, opacity .15s",
      }}
    >
      <span
        style={{
          flex: "none",
          width: 46,
          height: 46,
          borderRadius: 13,
          display: "grid",
          placeItems: "center",
          ...(rec
            ? { color: "#0B1120", background: `linear-gradient(150deg, ${c}, ${c})`, boxShadow: `0 10px 22px -10px ${c}` }
            : { color: c, background: `${c}33`, border: `1px solid ${c}52` }),
        }}
      >
        <Icon name={option.icon} size={23} />
      </span>

      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        {rec && <RecommendedBadge c={c} size="sm" />}
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "1rem", lineHeight: 1.2, color: "var(--text-main)", letterSpacing: "-.01em" }}>
          {option.label}
        </span>
        <span style={{ fontSize: ".8rem", fontWeight: 500, lineHeight: 1.3, color: "var(--text-muted)" }}>
          {option.desc}
        </span>
      </span>

      <span style={{ flex: "none", display: "grid", color: hover ? brightOf(c) : `${c}AD` }}>
        <Icon name="chevron" size={18} />
      </span>

      {loading && <LoadingOverlay />}
    </button>
  );
}

/* ------------------------------------------------------------- banner / fila "fin de semana" */
function ComingBanner({ coming, faded, loading, onPick }) {
  const c = coming.color;
  const unlocked = !!coming.unlocked;
  const [hover, setHover] = useState(false);
  const interactive = unlocked && typeof onPick === "function";

  return (
    <button
      type="button"
      disabled={!interactive}
      onClick={interactive ? () => onPick(coming.id) : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      style={{
        position: "relative",
        overflow: "hidden",
        appearance: "none",
        font: "inherit",
        textAlign: "left",
        width: "100%",
        color: "inherit",
        display: "flex",
        alignItems: "center",
        gap: 13,
        marginTop: 10,
        padding: "13px 14px",
        borderRadius: 16,
        background: `${c}14`,
        border: `1.5px dashed ${c}66`,
        cursor: interactive ? "pointer" : "default",
        opacity: faded ? 0.42 : 1,
        transform: interactive && hover ? "translateY(-2px)" : "none",
        boxShadow: interactive && hover ? `0 14px 30px -16px ${c}D9` : "none",
        transition: "transform .14s, box-shadow .14s, opacity .15s",
      }}
    >
      <span
        style={{
          position: "relative",
          flex: "none",
          width: 42,
          height: 42,
          borderRadius: 12,
          display: "grid",
          placeItems: "center",
          color: c,
          background: `${c}29`,
          border: `1px solid ${c}4D`,
        }}
      >
        <Icon name={coming.icon} size={20} />
        {!unlocked && (
          <span
            style={{
              position: "absolute",
              right: -4,
              bottom: -4,
              width: 18,
              height: 18,
              borderRadius: 6,
              display: "grid",
              placeItems: "center",
              background: c,
              color: "#2A2009",
            }}
          >
            <Icon name="lock" size={11} />
          </span>
        )}
      </span>

      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: ".95rem", lineHeight: 1.2, color: "var(--text-main)" }}>
          {coming.label}
        </span>
        <span style={{ fontSize: ".78rem", color: "var(--text-muted)" }}>{coming.desc}</span>
      </span>

      <span
        style={{
          flex: "none",
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "5px 9px",
          borderRadius: 99,
          fontSize: ".66rem",
          fontWeight: 800,
          whiteSpace: "nowrap",
          color: "var(--warning-text)",
          background: `${c}2E`,
          border: `1px solid ${c}57`,
        }}
      >
        <Icon name={unlocked ? "check" : "calendar"} size={12} /> {unlocked ? "Hoy" : coming.unlockLabel}
      </span>

      {loading && <LoadingOverlay />}
    </button>
  );
}

/* -------------------------------------------------------------- fila destructiva */
function DislikeRow({ faded, loading, onPick, heading, label = "No me gustan estos platos", desc = "Evitar sugerencias similares" }) {
  const [hover, setHover] = useState(false);
  return (
    <div style={{ marginTop: 14, ...(heading ? {} : { paddingTop: 13, borderTop: "1px solid var(--border)" }) }}>
      {heading && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "2px 0 12px" }}>
          <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
          <span style={{ fontSize: ".6rem", fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--text-light)", whiteSpace: "nowrap" }}>
            {heading}
          </span>
          <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
        </div>
      )}
      <button
        type="button"
        onClick={() => onPick("dislike")}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        style={{
          position: "relative",
          appearance: "none",
          font: "inherit",
          textAlign: "left",
          cursor: "pointer",
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "11px 13px",
          borderRadius: 14,
          color: "inherit",
          background: hover ? `${DANGER}14` : "transparent",
          border: `1px solid ${hover ? `${DANGER}73` : "var(--border)"}`,
          opacity: faded ? 0.42 : 1,
          transition: ".15s",
        }}
      >
        <span
          style={{
            flex: "none",
            width: 38,
            height: 38,
            borderRadius: 11,
            display: "grid",
            placeItems: "center",
            color: DANGER,
            background: `${DANGER}24`,
            border: `1px solid ${DANGER}42`,
          }}
        >
          <Icon name="thumbDown" size={18} />
        </span>
        <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
          <span style={{ fontSize: ".9rem", fontWeight: 700, color: hover ? "var(--danger-text)" : "var(--text-main)" }}>
            {label}
          </span>
          <span style={{ fontSize: ".78rem", fontWeight: 500, color: "var(--text-muted)" }}>
            {desc}
          </span>
        </span>
        {loading && <LoadingOverlay />}
      </button>
    </div>
  );
}

/* ============================================================ componente raíz */
export default function MotivoActualizarModal({
  open = false,
  title = "¿Por qué quieres actualizar?",
  subtitle = null,
  contextLabel = null,
  quota = { left: 0, total: 0 },
  unlimited = false,
  options = [],
  coming = null,
  extraRows = [],
  dislike = { label: "No me gustan estos platos", desc: "Evitar sugerencias similares" },
  pickingId = null,
  onPick = () => {},
  onClose = () => {},
}) {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const busy = pickingId != null;
  const handleClose = useCallback(() => {
    if (pickingId == null) onClose();
  }, [pickingId, onClose]);

  const { containerRef } = useModalAccessibility({ isOpen: open, onClose: handleClose, disableClose: busy });

  // [P3-MOTIVO-MODAL-HIDE-NOTIF · 2026-06-24] En móvil, ocultar el launcher
  // flotante de notificaciones mientras el modal está abierto.
  useEffect(() => {
    if (typeof document === "undefined" || !open) return undefined;
    document.body.classList.add("mealfit-hide-notif-mobile");
    return () => document.body.classList.remove("mealfit-hide-notif-mobile");
  }, [open]);

  const [hero, ...minis] = options.length ? options : [];

  const sheet = isMobile;

  return (
    <AnimatePresence>
      {open && hero && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: sheet ? "flex-end" : "center",
            justifyContent: "center",
            padding: sheet ? 0 : "1rem",
          }}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            aria-hidden="true"
            style={{ position: "absolute", inset: 0, background: "rgba(15, 23, 42, 0.5)", backdropFilter: "blur(4px)" }}
          />

          <motion.div
            ref={containerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="motivo-actualizar-title"
            tabIndex={-1}
            className="mealfit-modal-content"
            initial={sheet ? { y: "100%" } : { opacity: 0, scale: 0.96, y: 12 }}
            animate={sheet ? { y: 0 } : { opacity: 1, scale: 1, y: 0 }}
            exit={sheet ? { y: "100%" } : { opacity: 0, scale: 0.96, y: 12 }}
            transition={sheet ? { type: "spring", damping: 30, stiffness: 320 } : { duration: 0.2 }}
            drag={sheet ? "y" : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(e, info) => {
              if (sheet && info.offset.y > 110 && !busy) handleClose();
            }}
            style={{
              position: "relative",
              zIndex: 1,
              width: "100%",
              maxWidth: sheet ? "none" : 404,
              maxHeight: sheet ? "92dvh" : "92dvh",
              overflowY: "auto",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderTopWidth: sheet ? "1px" : "1px",
              borderRadius: sheet ? "24px 24px 0 0" : 24,
              boxShadow: sheet ? "0 -16px 50px -16px rgba(0,0,0,.6)" : "0 30px 70px -24px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.02)",
              padding: sheet ? "8px 18px calc(18px + env(safe-area-inset-bottom, 0px))" : 22,
              fontFamily: "var(--font-body)",
              color: "var(--text-main)",
              pointerEvents: busy ? "none" : "auto",
            }}
          >
            {/* drag handle (solo móvil) */}
            {sheet && (
              <div style={{ display: "flex", justifyContent: "center", padding: "6px 0 12px" }}>
                <span style={{ width: 40, height: 4, borderRadius: 99, background: "var(--border)" }} />
              </div>
            )}

            {/* cabecera: título + cupo del mes */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <h2
                id="motivo-actualizar-title"
                style={{
                  flex: 1,
                  minWidth: 0,
                  margin: 0,
                  fontFamily: "var(--font-heading)",
                  fontSize: sheet ? "1.28rem" : "1.34rem",
                  fontWeight: 800,
                  letterSpacing: "-.02em",
                  lineHeight: 1.12,
                }}
              >
                {title}
              </h2>
              <span
                title={unlimited ? "Regeneraciones ilimitadas (Premium)" : `Te quedan ${quota.left} de ${quota.total} regeneraciones este mes`}
                style={{
                  flex: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "7px 12px",
                  borderRadius: 13,
                  background: "var(--bg-muted)",
                  border: "1px solid var(--border)",
                }}
              >
                <span style={{ display: "grid", color: "var(--primary)" }}>
                  <Icon name="refresh" size={14} />
                </span>
                <span style={{ fontFamily: "var(--font-heading)", fontSize: "1rem", fontWeight: 800, lineHeight: 1 }}>
                  {unlimited ? (
                    <b style={{ color: "var(--primary)" }}>∞</b>
                  ) : (
                    <>
                      <b style={{ color: "var(--primary)" }}>{quota.left}</b>/{quota.total}
                    </>
                  )}
                </span>
              </span>
            </div>

            <p style={{ margin: "5px 0 0", fontSize: ".86rem", lineHeight: 1.45, color: "var(--text-muted)", fontWeight: 500 }}>
              {subtitle != null ? (
                subtitle
              ) : sheet ? (
                "Toca el motivo que mejor describe lo que buscas hoy."
              ) : unlimited ? (
                <>Toca el motivo que mejor describe lo que buscas hoy. Tienes <b style={{ color: "var(--primary)" }}>regeneraciones ilimitadas</b> (Premium).</>
              ) : (
                <>Toca el motivo que mejor describe lo que buscas hoy. Te quedan <b style={{ color: "var(--primary)" }}>{quota.left} regeneraciones</b> este mes.</>
              )}
            </p>

            {/* [P3-SWAP-MODAL-CONTEXT-LABEL · 2026-06-24] Rótulo de contexto (NO botón):
                franja de acento + etiqueta "PLATO A CAMBIAR" + nombre. Antes era una
                caja con borde/fondo redondeada y se confundía con una opción clicable. */}
            {contextLabel && (
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  marginTop: 16,
                  paddingLeft: 12,
                  borderLeft: "3px solid #FB923C",
                }}
              >
                <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      fontSize: ".62rem",
                      fontWeight: 800,
                      letterSpacing: ".07em",
                      textTransform: "uppercase",
                      color: "#FB923C",
                    }}
                  >
                    <Icon name="refresh" size={11} /> Plato a cambiar
                  </span>
                  <span style={{ fontSize: ".92rem", fontWeight: 700, lineHeight: 1.3, color: "var(--text-main)" }}>
                    {contextLabel}
                  </span>
                </span>
              </div>
            )}

            {sheet ? (
              /* ---- lista vertical (bottom-sheet móvil) ---- */
              <>
                <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                  <OptionRow option={hero} faded={busy && pickingId !== hero.id} loading={pickingId === hero.id} onPick={onPick} />
                  {minis.map((o) => (
                    <OptionRow key={o.id} option={o} faded={busy && pickingId !== o.id} loading={pickingId === o.id} onPick={onPick} />
                  ))}
                </div>
                {coming && (
                  <ComingBanner coming={coming} faded={busy && pickingId !== coming.id} loading={pickingId === coming.id} onPick={onPick} />
                )}
                {extraRows.length > 0 && (
                  <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                    {extraRows.map((o) => (
                      <OptionRow key={o.id} option={o} faded={busy && pickingId !== o.id} loading={pickingId === o.id} onPick={onPick} />
                    ))}
                  </div>
                )}
                <DislikeRow heading="¿No es lo que buscas?" label={dislike.label} desc={dislike.desc} faded={busy && pickingId !== "dislike"} loading={pickingId === "dislike"} onPick={onPick} />
              </>
            ) : (
              /* ---- bento (escritorio) ---- */
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 18 }}>
                  <OptionTile option={hero} hero faded={busy && pickingId !== hero.id} loading={pickingId === hero.id} onPick={onPick} />
                  {minis.map((o) => (
                    <OptionTile key={o.id} option={o} faded={busy && pickingId !== o.id} loading={pickingId === o.id} onPick={onPick} />
                  ))}
                </div>
                {coming && (
                  <ComingBanner coming={coming} faded={busy && pickingId !== coming.id} loading={pickingId === coming.id} onPick={onPick} />
                )}
                {extraRows.map((o) => (
                  <div key={o.id} style={{ marginTop: 10 }}>
                    <OptionRow option={o} faded={busy && pickingId !== o.id} loading={pickingId === o.id} onPick={onPick} />
                  </div>
                ))}
                <DislikeRow label={dislike.label} desc={dislike.desc} faded={busy && pickingId !== "dislike"} loading={pickingId === "dislike"} onPick={onPick} />
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
