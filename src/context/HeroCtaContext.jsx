import { createContext, useContext, useState } from 'react';
import PropTypes from 'prop-types';

// [HEADER-STICKY-CTA · 2026-05-31] Puente Hero→Header para el CTA "sticky" del
// landing. El Hero (productor) observa su propio botón "Crear mi Plan Ahora" con
// IntersectionObserver y reporta aquí si está en pantalla; el Header (consumidor)
// revela un CTA equivalente cuando el del Hero sale de vista al hacer scroll, y lo
// oculta al volver arriba.
//
// Va por contexto y NO por document.getElementById desde el Header porque Home es
// lazy (App.jsx → `lazy(() => import('./pages/Home'))`): el Hero monta DESPUÉS del
// Header, así que un getElementById en el primer efecto del Header devolvería null.
// El contexto resuelve el timing sin polling: el observer vive en el Hero (monta
// con su propio ref) y empuja el estado hacia arriba.
//
// Default `true` (visible) ⇒ el sticky arranca oculto hasta que el observer diga
// lo contrario.
const HeroCtaContext = createContext({
    heroCtaVisible: true,
    setHeroCtaVisible: () => {},
});

export const HeroCtaProvider = ({ children }) => {
    const [heroCtaVisible, setHeroCtaVisible] = useState(true);
    return (
        <HeroCtaContext.Provider value={{ heroCtaVisible, setHeroCtaVisible }}>
            {children}
        </HeroCtaContext.Provider>
    );
};

HeroCtaProvider.propTypes = { children: PropTypes.node };

export const useHeroCta = () => useContext(HeroCtaContext);
