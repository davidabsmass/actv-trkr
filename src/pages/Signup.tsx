import { Navigate } from "react-router-dom";

/**
 * The standalone signup page has been retired.
 * The canonical entry point is Checkout → Stripe → webhook provisioning.
 * Redirect any bookmarks or stale links to /checkout.
 */
const Signup = () => <Navigate to="/checkout" replace />;

export default Signup;
