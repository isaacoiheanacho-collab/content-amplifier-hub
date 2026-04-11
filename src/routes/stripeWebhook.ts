import { Request, Response } from 'express';
import Stripe from 'stripe';
import { verifyStripeSession } from '../services/paymentService';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export default async function stripeWebhook(req: Request, res: Response) {
  const sig = req.headers['stripe-signature'];

  if (!sig) {
    console.error('[Stripe] Missing stripe-signature header');
    return res.status(400).send('Webhook Error: Missing signature');
  }

  // DEBUG LOGS
  console.log('[Stripe] Raw Body received:', Buffer.isBuffer(req.body) ? 'Yes (Buffer)' : 'No (Wrong Type)');

  let event: any; // Using 'any' here bypasses the Stripe namespace issue

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      endpointSecret
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Stripe] Webhook signature verification failed:', message);
    return res.status(400).send(`Webhook Error: ${message}`);
  }

  console.log(`[Stripe] Event verified: ${event.type}`);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    console.log('[Stripe] Processing session:', session.id);

    try {
      await verifyStripeSession(session.id);
      console.log('[Stripe] Database updated successfully');
    } catch (dbErr) {
      console.error('[Stripe] Database update failed:', dbErr);
    }
  }

  return res.json({ received: true });
}