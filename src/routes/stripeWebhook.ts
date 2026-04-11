import { Request, Response } from 'express';
import Stripe from 'stripe';
import { verifyStripeSession } from '../services/paymentService';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export default async function stripeWebhook(req: Request, res: Response) {
  const sig = req.headers['stripe-signature'] as string;

  let event: any;

  try {
    // req.body MUST be raw buffer (index.ts already ensures this)
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      endpointSecret
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Stripe] Webhook signature failed:', message);
    return res.status(400).send(`Webhook Error: ${message}`);
  }

  console.log(`[Stripe] Event received: ${event.type}`);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as any;
    console.log('[Stripe] checkout.session.completed:', session.id);

    await verifyStripeSession(session.id);
  }

  return res.json({ received: true });
}
