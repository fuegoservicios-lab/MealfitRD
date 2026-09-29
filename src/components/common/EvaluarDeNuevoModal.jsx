import React, { useState, useEffect, useCallback, useId, useRef } from "react";
// [P3-I18N-RADIOGROUP-TECLADO · 2026-08-21] Este grupo declaraba `radiogroup` y no
// implementaba nada de lo que ese rol promete: tres paradas de tabulador en vez de
// una, y las flechas sin efecto — que es justo lo que un lector de pantalla anuncia
// al entrar en el grupo.
import { useRadioGroupAccesible } from './useRadioGroupAccesible';
import { createPortal } from "react-dom";
import { useT } from "../../i18n";
import useModalAccessibility from "../../hooks/useModalAccessibility";
import { useLatestRef } from "../../hooks/useLatestRef";

/**
 * EvaluarDeNuevoModal — "Evaluar de Nuevo"
 * Modal de selección + confirmación para regenerar el plan (Bioboros).
 * Diseño del owner, tokens del DS (tema claro/oscuro automático), SIN emoji ✨.
 *
 * Patrón "elige y confirma": el usuario elige una de dos vías (radio) y pulsa el
 * ÚNICO botón de confirmar (refleja la opción elegida). La X de arriba cancela.
 *   • Renovar plan actual → vía recomendada (índigo, var(--primary-fill)).
 *   • Empezar desde cero  → vía destructiva (var(--danger-fill)). El botón se vuelve rojo.
 *
 * Añadidos para integrarlo como modal real: backdrop + portal a <body>, ESC +
 * click-fuera + scroll-lock, y prop `busy` para el loading durante la acción.
 *
 * [P1-PLAN-LOTE-718 · 2026-09-28] Tres defectos de la auditoría de Configuración:
 *   1. El foco no entraba NUNCA: el modal portaliza a <body>, fuera del panel de
 *      Configuración, cuya trampa de foco seguía activa. Con teclado no se llegaba a
 *      ningún botón. Ahora usa `useModalAccessibility` (foco inicial, trampa de Tab,
 *      ESC, bloqueo del scroll y devolución del foco al cerrar) — y SettingsDialog
 *      suspende la suya mientras haya una capa encima, esté donde esté en el DOM.
 *   2. El botón destructivo era blanco sobre #EF4444: 3,76:1, por debajo del AA. Los
 *      rellenos con texto blanco van en `--danger-fill` / `--primary-fill`.
 *   3. «Empezar desde cero» decía «elimina tu plan actual» y borra MUCHO más (ver
 *      `app.py::api_reset_user_preferences` → `reset_user_account_preferences`). Ahora
 *      lo dice entero, y como no tiene vuelta atrás, pide un segundo paso explícito y
 *      sugiere exportar los datos antes.
 * La API de props no cambia: `onConfirm(id)` sigue recibiendo el id elegido, solo que
 * para una opción destructiva llega tras el segundo paso.
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
// [P1-I18N-DASHBOARD · 2026-08-15] FUNCIÓN, no constante: una tabla de copy en
// ámbito de módulo se evalúa al importar —antes de que el catálogo exista— y se
// congela en español para siempre. Se llama en render (ver `choices` abajo).
const getDefaultChoices = (t) => [
  {
    id: "renovar",
    title: t("Renovar plan actual"),
    desc: t("Genera platos nuevos con los datos que ya configuraste."),
    tag: { type: "rec", label: t("Recomendado") },
  },
  {
    id: "cero",
    title: t("Empezar desde cero"),
    // [P1-PLAN-LOTE-718 · 2026-09-28] La lista EXACTA de `reset_user_account_preferences` (+ el DELETE del plan
    // que hace Settings antes): meal_plans (actual e historial), user_inventory (suplementos incluidos),
    // user_facts, meal_likes/meal_rejections, visual_diary y health_profile → '{}'. «elimina tu plan actual»
    // escondía todo lo demás, y la etiqueta «Borra todo» exageraba al otro lado: la cuenta, la suscripción y los
    // chats NO se tocan. Si el backend cambia qué borra, este texto cambia con él.
    desc: t("Te lleva al formulario inicial y borra tus planes (el actual y el historial), tu Nevera (con los suplementos), lo que la IA aprendió de ti, los platos que marcaste con me gusta o rechazaste, tu diario visual y tus respuestas del perfil: alergias, perfil clínico, preferencias, recordatorios e historial de peso."),
    nota: t("Se conservan tu cuenta, tu suscripción, tu historial de chats y lo que registraste en el diario (comidas, peso y agua)."),
    tag: { type: "danger", label: t("Irreversible") },
    destructive: true,
    // Segundo paso: lo que se enseña ANTES de borrar de verdad.
    confirmacion: {
      titulo: t("¿Seguro que quieres empezar desde cero?"),
      texto: t("Esto no se puede deshacer: lo que se borra no se puede recuperar."),
      consejo: t("Si quieres guardar una copia, descárgala antes en Configuración → Privacidad → Exportar datos."),
      boton: t("Sí, borrar y empezar de cero"),
    },
  },
];

/* [P1-PLAN-LOTE-718 · 2026-09-28] Una opción destructiva que no trae su propio texto de
   confirmación (un `choices` a medida) no se queda sin segundo paso: usa este. */
const getConfirmacionGenerica = (t) => ({
  titulo: t("¿Seguro que quieres continuar?"),
  texto: t("Esto no se puede deshacer: lo que se borra no se puede recuperar."),
  consejo: null,
  boton: t("Sí, continuar"),
});

/* Un doble clic en «Empezar desde cero» no puede valer por las dos confirmaciones: el
   botón del segundo paso ignora lo que llegue antes de este margen. */
const ARMADO_SEGUNDO_PASO_MS = 600;

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
        fontSize: ".75rem",
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
function ChoiceRow({ choice, selected, disabled, onSelect, propsRadio }) {
  const [hover, setHover] = useState(false);
  const accent = choice.destructive ? "var(--danger)" : "var(--primary)";

  return (
    <button
      type="button"
      {...propsRadio}
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
        {/* [P1-PLAN-LOTE-718] `wrap`: en un móvil estrecho la etiqueta baja de línea en vez de
            recortar el título con puntos suspensivos («Empezar des…»). */}
        <span style={{ display: "flex", alignItems: "center", gap: 9, rowGap: 4, flexWrap: "wrap", minWidth: 0 }}>
          <span style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: ".98rem", color: "var(--text-main)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
            {choice.title}
          </span>
          <Tag tag={choice.tag} />
        </span>
        <span style={{ fontSize: ".78rem", lineHeight: 1.4, fontWeight: 500, color: "var(--text-muted)" }}>
          {choice.desc}
        </span>
        {/* [P1-PLAN-LOTE-718] Lo que NO se toca, en su propia línea: es lo primero que
            alguien quiere saber antes de pulsar algo que borra. */}
        {choice.nota && (
          <span style={{ fontSize: ".78rem", lineHeight: 1.4, fontWeight: 600, color: "var(--text-main)" }}>
            {choice.nota}
          </span>
        )}
      </span>
    </button>
  );
}

/* --------------------------------------------------- botón confirmar (único) */
function ConfirmButton({ destructive, label, busy, busyLabel, onClick, botonRef }) {
  const [hover, setHover] = useState(false);
  // [P1-PLAN-LOTE-718 · 2026-09-28] Relleno sólido con texto BLANCO = los tokens `-fill`
  // (index.css): `--danger` es TINTA (#EF4444 en claro, rojo 400 en oscuro) y el blanco
  // encima daba 3,76:1. `--danger-fill` (#DC2626) y `--primary-fill` pasan AA en los tres
  // temas. Hover sin movimiento, como pidió el dueño en P2-HOVER-NO-MOTION: sombra + brillo.
  const relleno = destructive ? "var(--danger-fill)" : "var(--primary-fill)";
  const sombra = destructive ? "var(--cta-shadow-danger-hover)" : "0 14px 26px -14px var(--primary-fill)";

  return (
    <button
      ref={botonRef}
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-busy={busy || undefined}
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
        color: "#fff",
        background: relleno,
        opacity: busy ? 0.85 : 1,
        filter: hover && !busy ? "brightness(1.06)" : "none",
        boxShadow: hover && !busy ? sombra : "none",
        transition: "box-shadow .16s, filter .16s",
      }}
    >
      {busy ? busyLabel : label}
    </button>
  );
}

/* [P1-PLAN-LOTE-718 · 2026-09-28] «Volver» del segundo paso: la salida segura, fantasma. */
function BotonVolver({ label, disabled, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-hover="fantasma"
      style={{
        width: "100%",
        appearance: "none",
        font: "inherit",
        cursor: disabled ? "default" : "pointer",
        padding: 14,
        borderRadius: 14,
        fontFamily: "var(--font-heading)",
        fontWeight: 700,
        fontSize: ".95rem",
        color: "var(--text-main)",
        background: "transparent",
        border: "1px solid var(--border)",
      }}
    >
      {label}
    </button>
  );
}

/* ----------------------------------------------- responsive (bottom sheet móvil)
 * Los estilos del modal son inline (no soportan @media), así que inyectamos este
 * <style>. En ≤600px el overlay ancla el panel ABAJO (place-items:end stretch),
 * el panel ocupa el ancho completo, redondea SOLO las esquinas superiores, sube
 * desde abajo (ednSheetUp), respeta el safe-area de iOS y muestra un "grabber". */
const EDN_CSS = `
@keyframes ednSheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
@keyframes ednFadeIn { from { opacity: 0; } to { opacity: 1; } }
@media (max-width: 600px) {
  .edn-overlay {
    place-items: end stretch !important;
    padding: 0 !important;
    animation: ednFadeIn .2s ease !important;
  }
  .edn-panel {
    max-width: 100% !important;
    width: 100% !important;
    border-radius: 22px 22px 0 0 !important;
    border-bottom: none !important;
    padding-top: 26px !important;
    padding-bottom: calc(20px + env(safe-area-inset-bottom)) !important;
    max-height: 92vh !important;
    overflow-y: auto !important;
    animation: ednSheetUp .28s cubic-bezier(.16,1,.3,1) !important;
  }
  .edn-panel::before {
    content: "";
    position: absolute;
    top: 9px;
    left: 50%;
    transform: translateX(-50%);
    width: 42px;
    height: 4px;
    border-radius: 999px;
    background: var(--border);
  }
}
@media (prefers-reduced-motion: reduce) {
  .edn-overlay, .edn-panel { animation: none !important; }
}
`;

/* ============================================================ componente raíz */
// [P1-I18N-DASHBOARD · 2026-08-15] Los defaults de copy se resuelven DENTRO del
// cuerpo (no en la firma): un default de parámetro no puede llamar al hook, y el
// hook es lo que suscribe el componente al cambio de idioma.
export default function EvaluarDeNuevoModal({
  open = true,
  title = null,
  subtitle = null,
  choices = null,
  defaultChoice = "renovar",
  busy = false,
  onConfirm = () => {},
  onClose = () => {},
}) {
  const t = useT();
  const [selected, setSelected] = useState(defaultChoice);
  // [P1-PLAN-LOTE-718 · 2026-09-28] Paso de la ventana: «elegir» o «confirmar» (solo las
  // opciones destructivas pasan por el segundo). Se reinicia al cerrarse, sea quien sea
  // quien la cierre: el ajuste va DURANTE el render (el patrón que React sanciona para
  // derivar de una prop), no en un efecto — así no hay un render intermedio con el paso
  // viejo al reabrir.
  const [paso, setPaso] = useState("elegir");
  const [abiertoAntes, setAbiertoAntes] = useState(open);
  if (open !== abiertoAntes) {
    setAbiertoAntes(open);
    if (!open) setPaso("elegir");
  }
  const armadoEnRef = useRef(0);
  const volvioRef = useRef(false);
  const tituloConfirmarRef = useRef(null);
  const botonConfirmarRef = useRef(null);

  const idTitulo = useId();
  const idSubtitulo = useId();
  const idTextoConfirmar = useId();

  // [P1-PLAN-LOTE-718 · 2026-09-28] Accesibilidad de verdad, con el hook SSOT del repo:
  // foco inicial al panel, trampa de Tab, ESC, bloqueo del scroll y el foco de vuelta al
  // botón que lo abrió. Antes el componente solo escuchaba ESC y bloqueaba el scroll; el
  // foco se quedaba en Configuración, detrás, y con teclado no había forma de llegar aquí.
  //
  // `onClose` va por ref y `disableClose` se queda fijo A PROPÓSITO: el hook re-ejecuta su
  // efecto cuando cambian, y cada re-ejecución devuelve el foco al disparador y lo vuelve a
  // traer — Settings pasa un `onClose` nuevo en cada render y `busy` cambia al confirmar.
  // El «no cerrar mientras trabaja» lo decide `cerrar`, que lee `busy` al momento.
  const onCloseRef = useLatestRef(onClose);
  const busyRef = useLatestRef(busy);
  const cerrar = useCallback(() => {
    if (!busyRef.current) onCloseRef.current();
  }, [busyRef, onCloseRef]);
  const { containerRef } = useModalAccessibility({ isOpen: open, onClose: cerrar });

  // El foco acompaña al paso: al título del segundo (lo anuncia el lector de pantalla y el
  // botón destructivo NO queda enfocado por defecto), y de vuelta al botón al «Volver».
  useEffect(() => {
    if (!open) return;
    if (paso === "confirmar") {
      tituloConfirmarRef.current?.focus({ preventScroll: true });
    } else if (volvioRef.current) {
      volvioRef.current = false;
      botonConfirmarRef.current?.focus({ preventScroll: true });
    }
  }, [paso, open]);

  // [P3-I18N-RADIOGROUP-TECLADO · 2026-08-21] Flechas con envoltura, Home/End y una sola
  // parada de tabulador para las tres opciones.
  //
  // ARRIBA del `if (!open) return null`, no junto a su uso: un hook detras de un return
  // temprano es una llamada CONDICIONAL, y React exige el mismo orden en cada render.
  // Por eso las opciones se calculan aqui y no se reusa `choiceList`, que vive despues.
  const _idsOpciones = (choices ?? getDefaultChoices(t)).map((c) => c.id);
  const rgOpciones = useRadioGroupAccesible(_idsOpciones, selected, setSelected);

  if (!open) return null;

  const titleText = title ?? t("Evaluar de Nuevo");
  const subtitleText = subtitle ?? t("Elige cómo generar tu nuevo plan.");
  const choiceList = choices ?? getDefaultChoices(t);

  const current = choiceList.find((c) => c.id === selected) || choiceList[0];
  const destructive = !!current.destructive;
  const confirmando = paso === "confirmar" && destructive;
  const conf = current.confirmacion || getConfirmacionGenerica(t);

  const alPulsarConfirmar = () => {
    if (busy) return;
    if (!destructive) { onConfirm(selected); return; }
    // [P1-PLAN-LOTE-718] Lo irreversible no sale de un solo clic: primero el segundo paso.
    armadoEnRef.current = Date.now();
    setPaso("confirmar");
  };
  const alConfirmarDeVerdad = () => {
    if (busy) return;
    if (Date.now() - armadoEnRef.current < ARMADO_SEGUNDO_PASO_MS) return;
    onConfirm(selected);
  };
  const alVolver = () => {
    if (busy) return;
    volvioRef.current = true;
    setPaso("elegir");
  };

  // Portal a <body>: garantiza que el overlay fixed cubra el viewport aunque algún
  // ancestro de la página tenga transform/filter (que romperían position:fixed).
  return createPortal(
    <>
    <style>{EDN_CSS}</style>
    <div
      className="edn-overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) cerrar(); }}
      style={{
        position: "fixed",
        inset: 0,
        /* [P1-MODAL-OVER-DIALOG · 2026-08-10] 9999, no 1000, y por encima de la
           ventana de Configuración (9990). Con 1000 este modal se montaba
           DETRÁS de su backdrop opaco: el botón «Evaluar de nuevo» parecía
           muerto cuando en realidad funcionaba. Mismo valor que Modal.jsx —
           un modal está siempre en la capa de modales, no en una propia. */
        zIndex: 'var(--z-modal)',
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
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        aria-describedby={confirmando ? idTextoConfirmar : idSubtitulo}
        tabIndex={-1}
        className="edn-panel"
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
          onClick={cerrar}
          aria-label={t("Cerrar")}
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
            id={idTitulo}
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
            {titleText}
          </h2>
        </div>

        {confirmando ? (
          /* [P1-PLAN-LOTE-718 · 2026-09-28] Segundo paso de lo irreversible: que no hay vuelta
             atrás, cómo llevarse una copia antes, y una salida segura. El botón destructivo NO
             recibe el foco: lo recibe el título, para que se lea antes de decidir. */
          <div style={{ marginTop: 16 }}>
            <h3
              ref={tituloConfirmarRef}
              tabIndex={-1}
              style={{
                margin: 0,
                outline: "none",
                display: "flex",
                alignItems: "flex-start",
                gap: 9,
                fontFamily: "var(--font-heading)",
                fontWeight: 800,
                fontSize: "1.02rem",
                lineHeight: 1.3,
                color: "var(--danger-text)",
              }}
            >
              <span style={{ marginTop: 2 }}><Icon name="alert" size={18} stroke={2.2} /></span>
              {conf.titulo}
            </h3>
            <p id={idTextoConfirmar} style={{ margin: "10px 0 0", fontSize: ".86rem", lineHeight: 1.5, fontWeight: 500, color: "var(--text-main)" }}>
              {conf.texto}
            </p>
            {conf.consejo && (
              <p style={{ margin: "10px 0 0", fontSize: ".82rem", lineHeight: 1.5, fontWeight: 500, color: "var(--text-muted)" }}>
                {conf.consejo}
              </p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
              <ConfirmButton
                destructive
                label={conf.boton}
                busy={busy}
                busyLabel={t("Borrando…")}
                onClick={alConfirmarDeVerdad}
              />
              <BotonVolver label={t("Volver")} disabled={busy} onClick={alVolver} />
            </div>
          </div>
        ) : (
          <>
            <p id={idSubtitulo} style={{ margin: "12px 0 0", fontSize: ".86rem", lineHeight: 1.5, fontWeight: 500, color: "var(--text-muted)" }}>
              {subtitleText}
            </p>

            {/* opciones (radio) */}
            <div {...rgOpciones.propsGrupo} aria-label={titleText} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
              {choiceList.map((c) => (
                <ChoiceRow
                  key={c.id}
                  choice={c}
                  selected={c.id === selected}
                  disabled={busy}
                  onSelect={setSelected}
                  propsRadio={rgOpciones.propsRadio(c.id)}
                />
              ))}
            </div>

            {/* botón ÚNICO de confirmar (refleja la opción elegida) */}
            <div style={{ marginTop: 18 }}>
              <ConfirmButton
                botonRef={botonConfirmarRef}
                destructive={destructive}
                label={destructive ? t("Empezar desde cero") : t("Generar plan")}
                busy={busy}
                busyLabel={destructive ? t("Borrando…") : t("Generando…")}
                onClick={alPulsarConfirmar}
              />
            </div>
          </>
        )}
      </div>
    </div>
    </>,
    document.body
  );
}
