import { EmptyState } from 'mealfit-rd-ia';
import { Bookmark, BellOff, ShoppingCart } from 'lucide-react';

// Empty-state placeholder for lists with no content yet. Driven by
// `{ icon, title, description, cta, compact }`. The CTA is `{ label, onClick }`.

export const NoSavedDishes = () => (
  <div style={{ maxWidth: 460 }}>
    <EmptyState
      icon={Bookmark}
      title="No hay platos guardados"
      description="Cuando guardes un plato de tu plan, aparecerá aquí para que lo repitas cuando quieras."
    />
  </div>
);

export const NoNotifications = () => (
  <div style={{ maxWidth: 460 }}>
    <EmptyState
      icon={BellOff}
      title="Sin notificaciones"
      description="Te avisaremos aquí cuando tu plan esté listo o sea hora de hacer la compra."
      compact
    />
  </div>
);

export const WithCallToAction = () => (
  <div style={{ maxWidth: 460 }}>
    <EmptyState
      icon={ShoppingCart}
      title="Tu lista de compras está vacía"
      description="Genera un plan nutricional y armaremos tu lista del súper con cantidades y precios estimados."
      cta={{ label: 'Crear mi plan', onClick: () => {} }}
    />
  </div>
);
