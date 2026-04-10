import { Router } from 'express';
import Stripe from 'stripe';
import { verifyStripeSession } from '../services/paymentService';

const router = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-03-25.dahlia',
});

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

/**
 * STRIPE WEBHOOK HANDLER
 * POST /webhook/stripe
 */
router.post('/', async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      endpointSecret!
    );
  } catch (err: any) {
    console.error('[Stripe] ❌ Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`[Stripe] 🔔 Event received: ${event.type}`);

  // Handle checkout.session.completed
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;

    console.log('[Stripe] ✅ checkout.session.completed for session:', session.id);

    const result = await verifyStripeSession(session.id);

    if (result.success) {
      console.log('[Stripe] 🎉 Membership activated for session:', session.id);
    } else {
      console.error('[Stripe] ❌ Activation failed:', result.message);
    }
  }

  res.json({ received: true });
});

export default router;
