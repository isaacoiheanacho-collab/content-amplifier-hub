import { Router } from 'express';
import Stripe from 'stripe';
import { verifyStripeSession } from '../services/paymentService';

const router = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

router.post('/', async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;

  let event: any;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      endpointSecret!
    );
  } catch (err: any) {
    console.error('[Stripe] Webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`[Stripe] Event received: ${event.type}`);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as any;

    console.log('[Stripe] checkout.session.completed:', session.id);

    await verifyStripeSession(session.id);
  }

  res.json({ received: true });
});

export default router;
