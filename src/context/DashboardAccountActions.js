import { createContext, useContext } from 'react';

// Las páginas usan los mismos diálogos de ayuda y salida que el menú del layout.
export const DashboardAccountActionsContext = createContext(null);
export const useDashboardAccountActions = () => useContext(DashboardAccountActionsContext);
