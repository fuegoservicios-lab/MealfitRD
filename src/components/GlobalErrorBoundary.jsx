import React from 'react';

export class GlobalErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Caught error in GlobalErrorBoundary:", error, errorInfo);
    
    // Auto-reload the page if it's a chunk loading error.
    // Common symptoms of new deployment missing old chunks:
    // "Failed to fetch dynamically imported module" (404)
    // "text/html is not a valid JavaScript MIME type" (200 with fallback index.html)
    // "Unexpected token '<'" (200 with fallback index.html)
    // "Importing a module script failed" (Safari)
    const errMessage = error?.message?.toLowerCase() || "";
    const isChunkLoadError = 
      errMessage.includes("dynamically imported module") || 
      errMessage.includes("valid javascript mime type") ||
      errMessage.includes("importing a module script failed") ||
      errMessage.includes("unexpected token '<'") ||
      errMessage.includes("loading chunk");

    if (isChunkLoadError) {
      // Small timeout to avoid rapid reload loops in worst case scenarios,
      // but reload to get the new index.html and fresh chunk names.
      setTimeout(() => {
        window.location.reload(true);
      }, 500);
    }
  }

  render() {
    if (this.state.hasError) {
      // For chunk loading errors, this will display briefly before the reload.
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="text-center p-6 bg-white rounded-2xl shadow-xl max-w-sm w-full border border-slate-100">
            <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
               <svg className="w-8 h-8 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
               </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Actualizando App...</h2>
            <p className="text-slate-500 text-sm">Se detectó una nueva versión. Recargando para aplicar los cambios más recientes.</p>
            <div className="mt-6 flex justify-center">
              <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children; 
  }
}
