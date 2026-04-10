import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import Stripe from 'stripe';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-03-25.dahlia' });

router.get('/test-key', authenticate, async (req: AuthRequest, res) => {
    try {
        const key = process.env.STRIPE_SECRET_KEY;
        const firstChars = key ? key.substring(0, 10) : 'null';
        res.json({ keyPresent: !!key, keyPrefix: firstChars });
    } catch (e: any) {
        res.json({ error: e.message });
    }
});

router.post('/test-checkout', authenticate, async (req: AuthRequest, res) => {
    const memberId = req.user.id;
    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: { name: 'Test Product' },
                    unit_amount: 500,
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: 'https://example.com/success',
            cancel_url: 'https://example.com/cancel',
            metadata: { memberId: memberId.toString() },
        });
        res.json({ url: session.url });
    } catch (error: any) {
        console.error('Test checkout error:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;