import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Clock, Refrigerator, Lock } from 'lucide-react';
import RecipesIcon from '../icons/RecipesIcon';
import AgentIcon from '../icons/AgentIcon';
// [P1-GUEST-NAV-LOCK · 2026-06-15] Modo invitado: secciones que requieren cuenta.
import { useAssessment } from '../../context/AssessmentContext';
import { navItemsFor, isTrackingMode } from '../../config/dashboardNav';
// [P3-DASH-CROSSFADE-PRELOAD · 2026-05-19] Preload de chunks lazy al touchstart
import { prefetchRoute } from '../../utils/routePreload';
// [P3-HIST-LIST-ALWAYS-INSTANT · 2026-05-19] Prefetch del data del Historial
import { prefetchHistoryList } from '../../utils/historyCaches';
import styles from './BottomTabBar.module.css';

// [P1-PLAN-MODE · 2026-08-11] Las entradas salen del SSOT (config/dashboardNav);
// aquí solo se les pega el icono. La lista se arma DENTRO del componente porque
// depende del modo (contexto) — un const a nivel de módulo no lo ve.
const _tabIcons = {
    plan: { icon: LayoutDashboard },
    agent: { icon: AgentIcon },
    pantry: { icon: Refrigerator, iconStroke: 2.25 },
    recipes: { icon: RecipesIcon },
    history: { icon: Clock },
};

const BottomTabBar = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { isGuest, userProfile, planData } = useAssessment();
    const tabs = navItemsFor({ trackingMode: isTrackingMode(userProfile, planData) })
        .map((it) => ({ ...it, ..._tabIcons[it.key] }));

    // [P1-GUEST-NAV-LOCK · 2026-06-15] Para invitados, todo salvo Plan requiere
    // cuenta (no está en GUEST_ROUTES). En vez de rebotar en silencio a
    // /dashboard, el tap lleva a /register (gancho de conversión).
    const isTabLocked = (path) => isGuest && path !== '/dashboard';

    const handleTap = (path) => {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(15);
        }
        navigate(isTabLocked(path) ? '/register' : path);
        // Wait for React to render the new route, then force scroll to absolute top
        setTimeout(() => {
            window.scrollTo(0, 0);
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
        }, 0);
    };

    return (
        <nav className={styles.tabBar}>
            {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = location.pathname === tab.path;
                const locked = isTabLocked(tab.path);
                const _prefetch = () => {
                    if (locked) return; // no prefetch de rutas que el invitado no abrirá
                    prefetchRoute(tab.path);
                    // [P3-HIST-LIST-ALWAYS-INSTANT · 2026-05-19] /history prefetchea
                    // también el data del listado — no solo el chunk JS.
                    if (tab.path === '/history') prefetchHistoryList();
                };
                return (
                    <button
                        key={tab.path}
                        className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
                        onClick={() => handleTap(tab.path)}
                        onTouchStart={_prefetch}
                        onMouseEnter={_prefetch}
                        aria-label={locked ? `${tab.label} (crea tu cuenta para desbloquear)` : tab.label}
                        aria-current={isActive ? 'page' : undefined}
                        style={locked ? { opacity: 0.55 } : undefined}
                    >
                        <span style={{ position: 'relative', display: 'inline-flex' }}>
                            <Icon
                                size={24}
                                strokeWidth={isActive ? (tab.iconStroke ?? 2) + 0.5 : (tab.iconStroke ?? 2)}
                                className={styles.tabIcon}
                            />
                            {locked && (
                                <Lock
                                    size={11}
                                    strokeWidth={2.75}
                                    aria-hidden="true"
                                    style={{ position: 'absolute', top: -4, right: -7 }}
                                />
                            )}
                        </span>
                        <span className={styles.tabLabel}>{tab.label}</span>
                        {isActive && <span className={styles.activeIndicator} />}
                    </button>
                );
            })}
        </nav>
    );
};

export default BottomTabBar;
