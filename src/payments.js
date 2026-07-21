// Payment abstraction. Uses Stripe Checkout when a key is configured,
// otherwise a fully functional in-app demo flow so the app works out of the box.
import Stripe from 'stripe';
import { config } from './config.js';

let stripe = null;
if (config.paymentMode === 'stripe') {
  stripe = new Stripe(config.stripeSecretKey);
}

// Creates a checkout session for a booking. Returns a URL the customer visits.
export async function createCheckout(booking, service) {
  if (config.paymentMode === 'stripe') {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: booking.amount_cents,
            product_data: {
              name: service.name,
              description: `HVAC service on ${booking.scheduled_date} at ${booking.scheduled_time}`,
            },
          },
        },
      ],
      customer_email: booking.email,
      client_reference_id: booking.reference,
      metadata: { reference: booking.reference },
      success_url: `${config.publicBaseUrl}/api/payments/confirm?reference=${booking.reference}&provider=stripe&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.publicBaseUrl}/?canceled=${booking.reference}`,
    });
    return { url: session.url, provider: 'stripe', ref: session.id };
  }

  // Demo mode: route the customer to an in-app simulated payment page.
  return {
    url: `/pay.html?reference=${booking.reference}`,
    provider: 'demo',
    ref: `demo_${booking.reference}`,
  };
}

// Verifies a Stripe session was actually paid (used on the success redirect).
export async function verifyStripeSession(sessionId) {
  if (config.paymentMode !== 'stripe' || !sessionId) return false;
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  return session.payment_status === 'paid';
}

export const paymentMode = config.paymentMode;
