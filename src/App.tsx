import { CheckoutPage } from "./checkout/CheckoutPage.js";
import { DashboardPage } from "./dashboard/DashboardPage.js";

export default function App() {
  return window.location.pathname === "/accesspatch"
    ? <DashboardPage />
    : <CheckoutPage />;
}
