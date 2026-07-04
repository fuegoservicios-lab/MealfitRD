import { Fragment, useState } from 'react';
import PropTypes from 'prop-types';
// [P3-MORE-INFO-MENU · 2026-07-03] Enlaces del submenú "Más información"
// (SSOT compartido con el menú "más" móvil de DashboardLayout).
import { MORE_INFO_GROUPS, SUPPORT_EMAIL, landingUrl } from './moreInfoLinks';
import styles from './AccountMenu.module.css';

/* [P3-ACCOUNT-MENU-REDESIGN · 2026-06-27] Card del menú de cuenta del sidebar.
   Diseño aportado por el owner. Componente presentacional: el padre
   (DashboardLayout) calcula plan/tier/guest y pasa los handlers reales.
   Extensiones sobre el diseño base, todas opcionales (degradan al diseño puro):
     - `avatar`        ReactNode → reemplaza la inicial (MinimalAvatar).
     - `subLabel`      texto bajo el email (invitado → "Plan de muestra").
     - `planAccessory` ReactNode junto al nombre del plan (Crown para Ultra).
     - `settingsSlot`  ReactNode que reemplaza el item "Configuración"
                       (invitado → selector de tema, sin fetches auth).
     - `onSettingsHover` / `onViewPlansHover` → prefetch de chunk al hover. */

/* — Iconos (línea, heredan currentColor) — */
const GearIcon = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
       strokeLinecap="round" strokeLinejoin="round" {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const LogoutIcon = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
       strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const ChevronRight = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
       strokeLinecap="round" strokeLinejoin="round" {...p}>
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const ChevronLeft = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
       strokeLinecap="round" strokeLinejoin="round" {...p}>
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const InfoIcon = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
       strokeLinecap="round" strokeLinejoin="round" {...p}>
    <circle cx="12" cy="12" r="9" />
    <line x1="12" y1="11" x2="12" y2="16" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

const HelpIcon = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
       strokeLinecap="round" strokeLinejoin="round" {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const ExternalIcon = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
       strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

const ChevronDown = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
       strokeLinecap="round" strokeLinejoin="round" {...p}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const ChevronUp = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
       strokeLinecap="round" strokeLinejoin="round" {...p}>
    <polyline points="6 15 12 9 18 15" />
  </svg>
);

/* [P3-ACCOUNT-MENU-REDESIGN · 2026-06-27] Fila de identidad reutilizable: avatar
   + nombre + email + chevron. Es a la vez el PIE de la card (estado abierto) y el
   botón DISPARADOR del sidebar (estado cerrado) → así ambos estados se ven
   idénticos por construcción (mismo markup + mismos estilos), no por copiar CSS.
   `chevron='up'` para el disparador (abre hacia arriba), `'down'` para el pie. */
export function AccountIdentityButton({
  avatar = null,
  name,
  email = null,
  subLabel = null,
  chevron = 'down',
  onClick,
  className = '',
  style,
  ariaLabel,
  ariaHasPopup,
  ariaExpanded,
}) {
  const initial = name?.[0]?.toUpperCase() ?? '?';
  const Chevron = chevron === 'up' ? ChevronUp : ChevronDown;
  return (
    <button
      type="button"
      className={`${styles.account} ${className}`.trim()}
      style={style}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-haspopup={ariaHasPopup}
      aria-expanded={ariaExpanded}
    >
      <span className={styles.avatar} aria-hidden="true">{avatar ?? initial}</span>
      <span className={styles.accountText}>
        <span className={styles.name}>{name}</span>
        {email && <span className={styles.email}>{email}</span>}
        {subLabel && <span className={styles.email}>{subLabel}</span>}
      </span>
      <Chevron className={styles.accountChevron} />
    </button>
  );
}

AccountIdentityButton.propTypes = {
  avatar: PropTypes.node,
  name: PropTypes.string,
  email: PropTypes.string,
  subLabel: PropTypes.node,
  chevron: PropTypes.oneOf(['up', 'down']),
  onClick: PropTypes.func,
  className: PropTypes.string,
  style: PropTypes.object,
  ariaLabel: PropTypes.string,
  ariaHasPopup: PropTypes.string,
  ariaExpanded: PropTypes.bool,
};

export default function AccountMenu({
  user = { name: 'angelobrito915', email: 'angelobrito915@gmail.com' },
  plan = 'Gratuito',
  planAccessory = null,
  avatar = null,
  subLabel = null,
  settingsSlot = null,
  settingsLabel = 'Configuración',
  logoutLabel = 'Cerrar sesión',
  viewPlansLabel = 'Ver planes',
  onViewPlans,
  onViewPlansHover,
  onSettings,
  onSettingsHover,
  onLogout,
  onAccount,
}) {
  // [P3-MORE-INFO-MENU · 2026-07-03] Vista del submenú "Más información": la
  // card intercambia su contenido por el panel de enlaces (patrón Claude.ai).
  // El popover se desmonta al cerrarse → el estado vuelve solo a la vista raíz.
  const [showMoreInfo, setShowMoreInfo] = useState(false);

  if (showMoreInfo) {
    return (
      <div className={styles.card} role="menu">
        <button
          type="button"
          className={styles.backRow}
          onClick={() => setShowMoreInfo(false)}
          aria-label="Volver al menú de cuenta"
        >
          <ChevronLeft className={styles.backChevron} />
          Más información
        </button>
        <div className={styles.infoMenu}>
          {MORE_INFO_GROUPS.map((group, gi) => (
            <Fragment key={gi}>
              {gi > 0 && <div className={styles.infoDivider} role="separator" />}
              {group.map((link) => (
                <a
                  key={link.path}
                  href={landingUrl(link.path)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.infoLink}
                  role="menuitem"
                  onClick={() => onAccount?.()}
                >
                  <span className={styles.itemLabel}>{link.label}</span>
                  <ExternalIcon className={styles.externalIcon} />
                </a>
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.card} role="menu">
      {/* Encabezado de plan */}
      <header className={styles.planHeader}>
        <div className={styles.planInfo}>
          <span className={styles.kicker}>Tu plan</span>
          <span className={styles.planNameRow}>
            <span className={styles.planName}>{plan}</span>
            {planAccessory && <span className={styles.planAccessory}>{planAccessory}</span>}
          </span>
        </div>
        <button
          type="button"
          className={styles.verBtn}
          onClick={onViewPlans}
          onMouseEnter={onViewPlansHover}
          onFocus={onViewPlansHover}
          onTouchStart={onViewPlansHover}
          role="menuitem"
        >
          {viewPlansLabel}
          <ChevronRight className={styles.verChevron} />
        </button>
      </header>

      {/* Acciones */}
      <div className={styles.menu}>
        {settingsSlot ? (
          <div className={styles.settingsSlot}>{settingsSlot}</div>
        ) : (
          <button
            type="button"
            className={styles.item}
            role="menuitem"
            onClick={onSettings}
            onMouseEnter={onSettingsHover}
            onFocus={onSettingsHover}
            onTouchStart={onSettingsHover}
          >
            <span className={styles.iconChip}><GearIcon className={styles.icon} /></span>
            <span className={styles.itemLabel}>{settingsLabel}</span>
          </button>
        )}

        <button
          type="button"
          className={styles.item}
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={false}
          onClick={() => setShowMoreInfo(true)}
        >
          <span className={styles.iconChip}><InfoIcon className={styles.icon} /></span>
          <span className={styles.itemLabel}>Más información</span>
          <ChevronRight className={styles.itemChevron} />
        </button>

        {/* [P3-HELP-MENU-ITEM · 2026-07-03] "Obtener ayuda" — abre el correo de
            soporte canónico (SUPPORT_EMAIL, SSOT en moreInfoLinks). */}
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className={styles.item}
          role="menuitem"
          onClick={() => onAccount?.()}
        >
          <span className={styles.iconChip}><HelpIcon className={styles.icon} /></span>
          <span className={styles.itemLabel}>Obtener ayuda</span>
        </a>

        {/* [P3-ACCOUNT-MENU-COMPACT · 2026-07-04] Ítems nuevos van ARRIBA de este
            divider; el grupo final queda reservado a la sesión. Más grupos =
            más dividers (no espaciado). */}
        <div className={styles.menuDivider} role="separator" />

        <button
          type="button"
          className={`${styles.item} ${styles.logout}`}
          role="menuitem"
          onClick={onLogout}
        >
          <span className={`${styles.iconChip} ${styles.logoutChip}`}>
            <LogoutIcon className={styles.icon} />
          </span>
          <span className={styles.itemLabel}>{logoutLabel}</span>
        </button>
      </div>

      {/* Pie de cuenta — mismo sub-componente que el disparador del sidebar */}
      <footer className={styles.footer}>
        <AccountIdentityButton
          avatar={avatar}
          name={user?.name}
          email={user?.email}
          subLabel={subLabel}
          chevron="down"
          onClick={onAccount}
          ariaLabel="Cerrar menú de cuenta"
        />
      </footer>
    </div>
  );
}

AccountMenu.propTypes = {
  user: PropTypes.shape({ name: PropTypes.string, email: PropTypes.string }),
  plan: PropTypes.string,
  planAccessory: PropTypes.node,
  avatar: PropTypes.node,
  subLabel: PropTypes.node,
  settingsSlot: PropTypes.node,
  settingsLabel: PropTypes.string,
  logoutLabel: PropTypes.string,
  viewPlansLabel: PropTypes.string,
  onViewPlans: PropTypes.func,
  onViewPlansHover: PropTypes.func,
  onSettings: PropTypes.func,
  onSettingsHover: PropTypes.func,
  onLogout: PropTypes.func,
  onAccount: PropTypes.func,
};
