import PropTypes from 'prop-types';
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

const HomeIcon = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
       strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
    <path d="M9.5 21v-6h5v6" />
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

const ChevronDown = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
       strokeLinecap="round" strokeLinejoin="round" {...p}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

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
  onHome,
  onLogout,
  onAccount,
}) {
  const initial = user?.name?.[0]?.toUpperCase() ?? '?';

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

        <button type="button" className={styles.item} role="menuitem" onClick={onHome}>
          <span className={styles.iconChip}><HomeIcon className={styles.icon} /></span>
          <span className={styles.itemLabel}>Inicio</span>
        </button>

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

      {/* Pie de cuenta */}
      <footer className={styles.footer}>
        <button type="button" className={styles.account} onClick={onAccount} aria-label="Cerrar menú de cuenta">
          <span className={styles.avatar} aria-hidden="true">{avatar ?? initial}</span>
          <span className={styles.accountText}>
            <span className={styles.name}>{user?.name}</span>
            {user?.email && <span className={styles.email}>{user.email}</span>}
            {subLabel && <span className={styles.email}>{subLabel}</span>}
          </span>
          <ChevronDown className={styles.accountChevron} />
        </button>
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
  onHome: PropTypes.func,
  onLogout: PropTypes.func,
  onAccount: PropTypes.func,
};
