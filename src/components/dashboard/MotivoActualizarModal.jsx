import React, { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useModalAccessibility } from "../../hooks/useModalAccessibility";

/**
 * MotivoActualizarModal — "¿Por qué quieres actualizar?"
 * Selector de motivo para regenerar los platos del día completo (MealfitRD).
 *
 * [P3-MOTIVO-MODAL-REDESIGN · 2026-06-24] Diseño aportado por el owner; injertado
 * sobre el flujo real de Dashboard (regenerateDay / cuota de regeneraciones /
 * dislike). Self-contained: overlay + a11y vía useModalAccessibility (ESC,
 * focus-trap, restore-focus, backdrop-close). No usa el Modal compartido porque
 * su botón de cerrar (top-right) chocaría con la pastilla de cupo del header.
 *
 * Se estiliza con los tokens del design system (var(--*) de index.css):
 * superficies, texto y bordes salen de los tokens; los acentos por opción usan
 * el color de la opción con alfa (idéntico a OptionPickerModal).
 *
 * Props:
 *   open        boolean                       — controla la visibilidad
 *   quota       { left, total }               — cupo de regeneraciones del mes
 *   unlimited   boolean                        — Premium (cupo ilimitado)
 *   options     Option[]                       — motivos seleccionables (1º = destacado)
 *   coming      Coming | null                  — opción "fin de semana" (locked o clickable)
 *   pickingId   string | null                  — id en curso (muestra spinner + atenúa)
 *   onPick      (id: string) => void           — al elegir un motivo / "no me gustan"
 *   onClose     () => void                     — cerrar
 *
 *   type Option = { id, label, desc, color, icon, recommended? }
 *   type Coming = { id, label, desc, color, icon, unlockLabel, unlocked? }
 */

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

/* --------------------------------------------------------- datos por defecto */
const DEFAULT_OPTIONS = [
  { id: "variety", label: "Quiero más variedad", desc: "Me apetecen platos distintos hoy", color: "#818CF8", icon: "shuffle", recommended: true },
  { id: "time", label: "No tengo tiempo hoy", desc: "Busco algo más rápido de preparar", color: "#A78BFA", icon: "clock" },
  { id: "cravings", label: "Tengo un antojo distinto", desc: "Un capricho que encaja en tu plan", color: "#FB7185", icon: "heart" },
];

const DANGER = "#F87171";

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

/* --------------------------------------------------------------- tile / hero */
function OptionTile({ option, hero, faded, loading, onPick }) {
  const [hover, setHover] = useState(false);
  const c = option.color;
  // [P3-MOTIVO-MODAL-ICON-POLISH · 2026-06-24] Tono claro del acento para la
  // pastilla "Más elegida": el color base sobre la tarjeta del mismo color se
  // veía apagado. Mezcla con blanco → texto + estrella vivos sobre el oscuro.
  const accentBright = `color-mix(in srgb, ${c}, #fff 42%)`;

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
        // tinte translúcido del color sobre la tarjeta (no usa color-mix con --bg-card)
        background: `linear-gradient(155deg, ${c}26, ${c}0D)`,
        border: `1.5px solid ${hover ? `${c}8C` : `${c}3D`}`,
        opacity: faded ? 0.42 : 1,
        filter: faded ? "saturate(.6)" : "none",
        transform: hover && !faded ? "translateY(-2px)" : "none",
        boxShadow: hover && !faded ? `0 14px 30px -16px ${c}D9` : "none",
        transition: "transform .14s, border-color .14s, box-shadow .14s, opacity .15s",
      }}
    >
      {/* etiqueta recomendado (solo destacado), en su propia línea */}
      {option.recommended && (
        <span
          style={{
            alignSelf: "flex-start",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            marginBottom: 13,
            padding: "4px 9px",
            borderRadius: 99,
            fontSize: ".55rem",
            fontWeight: 800,
            letterSpacing: ".06em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
            color: accentBright,
            background: `${c}40`,
            border: `1px solid ${c}85`,
          }}
        >
          <Icon name="star" size={11} fill={accentBright} /> Más elegida
        </span>
      )}

      {/* medallón del icono */}
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

      {/* flecha (solo destacado), anclada abajo */}
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

/* ------------------------------------------------------------- banner próximo */
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
function DislikeRow({ faded, loading, onPick }) {
  const [hover, setHover] = useState(false);
  return (
    <div style={{ marginTop: 14, paddingTop: 13, borderTop: "1px solid var(--border)" }}>
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
            No me gustan estos platos
          </span>
          <span style={{ fontSize: ".78rem", fontWeight: 500, color: "var(--text-muted)" }}>
            Evitar sugerencias similares
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
  quota = { left: 0, total: 0 },
  unlimited = false,
  options = DEFAULT_OPTIONS,
  coming = null,
  pickingId = null,
  onPick = () => {},
  onClose = () => {},
}) {
  const busy = pickingId != null;
  const handleClose = useCallback(() => {
    if (pickingId == null) onClose();
  }, [pickingId, onClose]);

  const { containerRef } = useModalAccessibility({ isOpen: open, onClose: handleClose, disableClose: busy });

  // [P3-MOTIVO-MODAL-HIDE-NOTIF · 2026-06-24] En móvil, ocultar el launcher
  // flotante de notificaciones (la campana se queda "encima" del modal por
  // estar atrapada en otro stacking context). Marca el body mientras el modal
  // está abierto; NotificationCenter.module.css oculta `.handle` con esa clase.
  useEffect(() => {
    if (typeof document === "undefined" || !open) return undefined;
    document.body.classList.add("mealfit-hide-notif-mobile");
    return () => document.body.classList.remove("mealfit-hide-notif-mobile");
  }, [open]);

  const [hero, ...minis] = options.length ? options : DEFAULT_OPTIONS;

  return (
    <AnimatePresence>
      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
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
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2 }}
            style={{
              position: "relative",
              zIndex: 1,
              width: "100%",
              maxWidth: 404,
              maxHeight: "92dvh",
              overflowY: "auto",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 24,
              boxShadow: "0 30px 70px -24px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.02)",
              padding: 22,
              fontFamily: "var(--font-body)",
              color: "var(--text-main)",
              pointerEvents: busy ? "none" : "auto",
            }}
          >
            {/* cabecera: título + cupo del mes */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <h2
                id="motivo-actualizar-title"
                style={{
                  flex: 1,
                  minWidth: 0,
                  margin: 0,
                  fontFamily: "var(--font-heading)",
                  fontSize: "1.34rem",
                  fontWeight: 800,
                  letterSpacing: "-.02em",
                  lineHeight: 1.12,
                }}
              >
                ¿Por qué quieres actualizar?
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
              {unlimited ? (
                <>Toca el motivo que mejor describe lo que buscas hoy. Tienes <b style={{ color: "var(--primary)" }}>regeneraciones ilimitadas</b> (Premium).</>
              ) : (
                <>
                  Toca el motivo que mejor describe lo que buscas hoy. Te quedan{" "}
                  <b style={{ color: "var(--primary)" }}>{quota.left} regeneraciones</b> este mes.
                </>
              )}
            </p>

            {/* bento: destacado + dos tiles */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 18 }}>
              <OptionTile option={hero} hero faded={busy && pickingId !== hero.id} loading={pickingId === hero.id} onPick={onPick} />
              {minis.map((o) => (
                <OptionTile key={o.id} option={o} faded={busy && pickingId !== o.id} loading={pickingId === o.id} onPick={onPick} />
              ))}
            </div>

            {/* próximamente / fin de semana */}
            {coming && (
              <ComingBanner
                coming={coming}
                faded={busy && pickingId !== coming.id}
                loading={pickingId === coming.id}
                onPick={onPick}
              />
            )}

            {/* destructiva */}
            <DislikeRow faded={busy && pickingId !== "dislike"} loading={pickingId === "dislike"} onPick={onPick} />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
