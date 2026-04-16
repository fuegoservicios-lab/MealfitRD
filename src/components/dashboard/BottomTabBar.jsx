import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Bot, Utensils, Settings, Archive } from 'lucide-react';
import styles from './BottomTabBar.module.css';

const tabs = [
    { icon: LayoutDashboard, label: 'Plan', path: '/dashboard' },
    { icon: Bot, label: 'Agente', path: '/dashboard/agent' },
    { icon: Archive, label: 'Nevera', path: '/dashboard/pantry' },
    { icon: Utensils, label: 'Recetas', path: '/dashboard/recipes' },
    { icon: Settings, label: 'Ajustes', path: '/dashboard/settings' },
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
                        aria-label={tab.label}
                    >
                        <Icon
                            size={24}
                            strokeWidth={isActive ? 2.5 : 2}
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
