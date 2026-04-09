import { Router } from 'express';
import express from 'express';
import Stripe from 'stripe';
import { activateMembership } from '../services/paymentService';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-03-25.dahlia' });

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
        console.error('STRIPE_WEBHOOK_SECRET not set');
        return res.status(500).send('Webhook secret missing');
    }

    let event: any;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
        console.error(`Webhook signature verification failed: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const memberId = parseInt(session.metadata.memberId);
        const type = session.metadata.type;
        const amountUsd = session.amount_total / 100;

        try {
            await activateMembership(memberId, amountUsd, type, session.id);
            console.log(`Membership activated for member ${memberId} via webhook`);
        } catch (error) {
            console.error('Failed to activate membership from webhook:', error);
        }
    }

    res.json({ received: true });
});

export default router;