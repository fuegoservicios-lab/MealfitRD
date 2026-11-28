# frontend/src/features/ — Módulos por feature (Bioboros)

Convención para nuevo código y extracción progresiva de páginas grandes (`Dashboard.jsx`, `AgentPage.jsx`, `History.jsx`, `Settings.jsx`, `AssessmentContext.jsx`):

- Cada feature nueva o desacoplada vive bajo `frontend/src/features/<feature>/` con un `index.js` claro que exporta su API pública.
- **Compatibilidad de tests**: ~440 tests de `frontend/src/__tests__/` leen ficheros históricos mediante `readFileSync`. Por eso mantenemos las implementaciones ancladas en sus rutas originales y exponemos fachadas limpias aquí cuando se extraen o agrupan utilidades nuevas.
- Features iniciales:
  - [`coach/`](./coach/index.js) — carga progresiva/caché de imágenes del Coach y Markdown memorizado.
  - [`food-logging/`](./food-logging/index.js) — búsqueda indexada de alimentos y registro manual rápido.
