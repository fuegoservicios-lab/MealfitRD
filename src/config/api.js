import { supabase } from '../supabase';

// Central API configuration
// En desarrollo, apuntamos directamente al servidor Python local.
// En producción (Vercel), utilizamos la variable de entorno para saber dónde está alojado el backend.
export const API_BASE = import.meta.env.DEV ? 'http://127.0.0.1:3001' : (import.meta.env.VITE_API_BASE_URL || '');

// Helper to build API URLs
export const api = (path) => `${API_BASE}${path}`;

// Custom fetch wrapper that includes Supabase auth token
export const fetchWithAuth = async (url, options = {}) => {
    let token = null;
    try {
        const { data: { session } } = await supabase.auth.getSession();
        token = session?.access_token;
    } catch (e) {
        console.error("Error getting auth session for fetch:", e);
    }

    const headers = new Headers(options.headers || {});
    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    // Envolvemos cualquier ruta relativa (ej. "/api/analyze") con API_BASE
    const finalUrl = url.startsWith('http') ? url : api(url);
    
    return fetch(finalUrl, {
        ...options,
        headers
    });
};
