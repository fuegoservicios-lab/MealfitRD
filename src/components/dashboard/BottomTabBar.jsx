import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Clock, Refrigerator } from 'lucide-react';
import RecipesIcon from '../icons/RecipesIcon';
import AgentIcon from '../icons/AgentIcon';
// [P3-DASH-CROSSFADE-PRELOAD · 2026-05-19] Preload de chunks lazy al touchstart
import { prefetchRoute } from '../../utils/routePreload';
// [P3-HIST-LIST-ALWAYS-INSTANT · 2026-05-19] Prefetch del data del Historial
import { prefetchHistoryList } from '../../utils/historyCaches';
import styles from './BottomTabBar.module.css';

const tabs = [
    { icon: LayoutDashboard, label: 'Plan', path: '/dashboard' },
    { icon: AgentIcon, label: 'Agente', path: '/dashboard/agent' },
    { icon: Refrigerator, label: 'Nevera', path: '/dashboard/pantry', iconStroke: 2.25 },
    { icon: RecipesIcon, label: 'Recetas', path: '/dashboard/recipes' },
    { icon: Clock, label: 'Historial', path: '/history' },
];

const BottomTabBar = () => {
    const location = useLocation();
    const navigate = useNavigate();

    const handleTap = (path) => {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(15);
        }
        navigate(path);
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
                return (
                    <button
                        key={tab.path}
                        className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
                        onClick={() => handleTap(tab.path)}
                        onTouchStart={() => {
                            prefetchRoute(tab.path);
                            // [P3-HIST-LIST-ALWAYS-INSTANT · 2026-05-19]
                            // /history prefetchea también el data del listado
                            // — no solo el chunk JS.
                            if (tab.path === '/history') prefetchHistoryList();
                        }}
                        onMouseEnter={() => {
                            prefetchRoute(tab.path);
                            if (tab.path === '/history') prefetchHistoryList();
                        }}
                        aria-label={tab.label}
                        aria-current={isActive ? 'page' : undefined}
                    >
                        <Icon
                            size={24}
                            strokeWidth={isActive ? (tab.iconStroke ?? 2) + 0.5 : (tab.iconStroke ?? 2)}
                            className={styles.tabIcon}
                        />
                        <span className={styles.tabLabel}>{tab.label}</span>
                        {isActive && <span className={styles.activeIndicator} />}
                    </button>
                );
            })}
        </nav>
    );
};

export default BottomTabBar;
