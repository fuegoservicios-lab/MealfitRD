// [P1-PLAN-LOTE-680] La hoja «Guarda tu plan». Centrada en escritorio, hoja inferior en
// móvil (el `Modal` común, como las confirmaciones). Dentro va el login DE VERDAD
// (`<Login embedded />`): Google, Apple y el código por correo con su misma lógica, sus
// mismos errores y su mismo camino de vuelta. No hay un segundo formulario que se
// desincronice del primero.
//
// Lo que dice arriba es lo que el invitado intentaba hacer —la misma frase que antes le
// decía un toast— y lo que dice abajo es la verdad de la adopción: el plan de muestra
// se guarda en una cuenta NUEVA; si la cuenta ya tenía plan, manda el suyo
// (`/adopt-guest-plan` responde 409). Prometer «se guarda» a secas sería falso para
// quien ya tenía cuenta.
import Modal from '../common/Modal';
import Login from '../../pages/Login';
import { useT } from '../../i18n';
import './HojaGuardarPlan.css';

const TITULO_ID = 'hoja-guardar-plan-titulo';

// Cadenas literales a propósito: el verificador de i18n sólo ve `t('…')` literal.
const textoDelMotivo = (motivo, t) => {
    switch (motivo) {
        case 'receta': return t('Crea tu cuenta para ver las recetas paso a paso');
        case 'cambiar': return t('Crea tu cuenta para cambiar platos con IA');
        case 'favoritos': return t('Crea tu cuenta para guardar tus favoritos');
        case 'registrar': return t('Crea tu cuenta para registrar lo que comes');
        case 'coach': return t('Crea tu cuenta para hablar con tu coach IA');
        case 'otroPlan': return t('Crea tu cuenta para generar más planes');
        case 'desbloquear': return t('Crea tu cuenta para desbloquear');
        default: return t('Este es un plan de muestra. Crea tu cuenta gratis para guardarlo, desbloquear la semana completa y registrar tus comidas.');
    }
};

// `abierta` y `motivo` van separados: al cerrar, la hoja todavía se anima hacia fuera y
// el texto no debe cambiar a mitad de la salida, así que el host conserva el motivo.
const HojaGuardarPlan = ({ abierta, motivo, onClose }) => {
    const t = useT();

    return (
        <Modal
            isOpen={abierta}
            onClose={onClose}
            titleId={TITULO_ID}
            maxWidth="440px"
            isBottomSheetOnMobile
        >
            <div className="mf-hoja-guardar">
                <h2 id={TITULO_ID} className="mf-hoja-guardar__titulo">{t('Guarda tu plan')}</h2>
                <p className="mf-hoja-guardar__motivo">{textoDelMotivo(motivo, t)}</p>
                <Login embedded />
                <p className="mf-hoja-guardar__nota">
                    {t('Si es tu primera vez, tu plan de muestra se queda guardado en tu cuenta.')}
                </p>
            </div>
        </Modal>
    );
};

export default HojaGuardarPlan;
