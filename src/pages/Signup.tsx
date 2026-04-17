import { Navigate } from "react-router-dom";

/**
 * The standalone signup page has been retired.
 * The canonical entry point is the homepage CTA → Stripe Checkout → webhook provisioning.
 */
const Signup = () => <Navigate to="/" replace />;

export default Signup;
