import styles from './SkipLink.module.css';

// [P3-11 · SKIP-TO-CONTENT · 2026-07-09] Primer elemento focusable del app-shell.
// Oculto visualmente hasta recibir foco (Tab al cargar la página); al activarlo
// mueve el foco a `#main-content` (el <main tabIndex={-1}> de Layout/DashboardLayout)
// para que los usuarios de teclado salten la navegación. En su propio CSS module
// (no toca index.css). Estilos en ambos temas vía tokens del :root.
export default function SkipLink() {
  return (
    <a href="#main-content" className={styles.skipLink}>
      Saltar al contenido
    </a>
  );
}
