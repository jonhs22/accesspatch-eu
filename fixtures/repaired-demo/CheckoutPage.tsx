import { FormEvent, useEffect, useRef, useState } from "react";
import "./checkout.css";

const EMAIL_ERROR = "Enter a valid email address before continuing.";
const PRICE = "€42.00";

function BrandMark() {
  return (
    <svg aria-hidden="true" className="brand-mark" viewBox="0 0 52 52">
      <path d="M8 6v39h36M19 17v18h20M19 35l14-14" fill="none" stroke="currentColor" strokeWidth="5" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect x="6.5" y="10" width="11" height="9" rx="1.2" fill="none" />
      <path d="M9 10V7.4a3 3 0 0 1 6 0V10M12 13.5v2" fill="none" />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 36">
      <rect x="3" y="4" width="42" height="28" rx="3" fill="none" />
      <path d="M4 13h40M11 23h10" fill="none" />
    </svg>
  );
}

function Stepper() {
  return (
    <ol className="checkout-steps" aria-label="Checkout steps">
      <li><span>1</span>Delivery</li>
      <li className="current"><span>2</span>Payment</li>
      <li><span>3</span>Review</li>
    </ol>
  );
}

export function CheckoutPage() {
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [email, setEmail] = useState("alex.example.com");
  const [error, setError] = useState(true);
  const [tabCount, setTabCount] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (checkoutOpen) emailRef.current?.focus();
  }, [checkoutOpen]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.includes("@") || !email.includes(".")) {
      setError(true);
      emailRef.current?.focus();
      return;
    }

    setError(false);
    setConfirmed(true);
  }


  return (
    <main className="checkout-page">
      <section className="transaction-surface" aria-label="Lattice Supply checkout">
        <header className="store-header">
          <a className="brand" href="/checkout" aria-label="Lattice Supply checkout">
            <BrandMark />
            <span>Lattice Supply</span>
          </a>
          <span className="secure-label"><LockIcon /> Secure checkout</span>
        </header>

        <div className="checkout-content">
          <h1>Checkout</h1>
          <Stepper />

          <dl className="checkout-details">
            <div><dt>Contact</dt><dd>alex.rivers@example.com</dd><a href="#payment">Change</a></div>
            <div><dt>Delivery</dt><dd>Alex Rivers, 12 Fjord Street, 8000 Aarhus, Denmark</dd><a href="#payment">Change</a></div>
          </dl>

          <section id="payment" className="payment-section" aria-labelledby="payment-heading">
            <div className="payment-heading-row">
              <h2 id="payment-heading">Payment</h2>
              {!checkoutOpen && (
                <button className="start-checkout" type="button" onClick={() => setCheckoutOpen(true)}>
                  Start secure checkout
                </button>
              )}
            </div>

            {checkoutOpen && !confirmed && (
              <form className="checkout-dialog" onSubmit={handleSubmit} aria-labelledby="checkout-title">
                <h2 id="checkout-title">Complete your order</h2>
                <div className="email-control">
                  <label htmlFor="email">Email</label>
                  <input
                    ref={emailRef}
                    id="email"
                    data-testid="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    aria-invalid={error}
                    aria-describedby={error ? "form-error" : undefined}
                  />
                </div>
                <button
                  className="payment-submit"
                  data-testid="payment-submit"
                  type="submit"
                  aria-label="Confirm and pay €42.00"
                >
                  <CardIcon />
                </button>
                {error && <p id="form-error" className="form-error" data-testid="form-error" role="alert" aria-live="assertive">{EMAIL_ERROR}</p>}
              </form>
            )}

            {confirmed && (
              <section className="order-confirmation" data-testid="order-confirmation" aria-labelledby="confirmation-title">
                <p className="confirmation-kicker">Order received</p>
                <h2 id="confirmation-title">Thank you, Alex.</h2>
                <p>Your synthetic order for the Contour Pack 18L is confirmed.</p>
              </section>
            )}
          </section>

          {checkoutOpen && !confirmed && (
            <p className="keyboard-overlay" data-testid="keyboard-overlay">
              Tab × {Math.max(tabCount, 5)} · focus repeats on Email
            </p>
          )}
        </div>
      </section>

      <aside className="order-summary" aria-label="Order summary">
        <div className="product-row">
          <img src="/assets/contour-pack-18l.png" alt="Contour Pack 18L in deep green" />
          <h2>Contour Pack 18L</h2>
        </div>
        <dl className="receipt-lines">
          <div><dt>Subtotal</dt><dd>{PRICE}</dd></div>
          <div><dt>Delivery</dt><dd>€0.00</dd></div>
          <div className="total"><dt>Total</dt><dd>{PRICE}</dd></div>
        </dl>
        <div className="receipt-card" aria-hidden="true"><CardIcon /></div>
      </aside>
    </main>
  );
}
