import { db } from '../models/db';

// Amounts from environment
const EARLY_BIRD_FEE = parseInt(process.env.EARLY_BIRD_FEE || '5000');
const STANDARD_FEE = parseInt(process.env.STANDARD_FEE || '20000');
const MAINTENANCE_FEE = parseInt(process.env.MONTHLY_MAINTENANCE_FEE || '500');

// Determine which fee applies to a member
export const getMemberFee = async (memberId: number): Promise<number> => {
    const result = await db.query('SELECT is_early_bird FROM members WHERE id = $1', [memberId]);
    const isEarlyBird = result.rows[0]?.is_early_bird;
    return isEarlyBird ? EARLY_BIRD_FEE : STANDARD_FEE;
};

// Create a checkout session with Stripe (or Paystack)
export const createCheckoutSession = async (memberId: number, amount: number, type: 'registration' | 'maintenance') => {
    // TODO: Replace with actual Stripe or Paystack integration.
    // Example using Stripe:
    // const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    // const session = await stripe.checkout.sessions.create({
    //     payment_method_types: ['card'],
    //     line_items: [{ price_data: { currency: 'ngn', unit_amount: amount, product_data: { name: 'Membership' } }, quantity: 1 }],
    //     mode: 'payment',
    //     success_url: `https://yourapp.com/success?session_id={CHECKOUT_SESSION_ID}`,
    //     cancel_url: `https://yourapp.com/cancel`,
    //     metadata: { memberId, type }
    // });
    // return session.url;

    // For now, return a message and log
    console.log(`[PAYMENT] Member ${memberId} would pay ${amount} for ${type}`);
    return null; // In production, return the checkout URL
};

// Webhook handler for payment confirmation
export const handlePaymentWebhook = async (payload: any, signature: string) => {
    // TODO: Verify signature (Stripe uses 'stripe-signature' header)
    // const event = stripe.webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET);
    // if (event.type === 'checkout.session.completed') {
    //     const session = event.data.object;
    //     const memberId = session.metadata.memberId;
    //     const amount = session.amount_total;
    //     const type = session.metadata.type;
    //     await activateMembership(memberId, amount, type, session.id);
    // }

    console.log('[PAYMENT] Webhook received, would activate membership');
    return { received: true };
};

// Activate membership after successful payment
export const activateMembership = async (memberId: number, amount: number, paymentType: string, transactionRef: string) => {
    try {
        await db.query('BEGIN');

        // Determine expiry: 1 year for registration, 1 month for maintenance
        let expiryDate: Date;
        if (paymentType === 'maintenance') {
            expiryDate = new Date();
            expiryDate.setMonth(expiryDate.getMonth() + 1);
        } else {
            expiryDate = new Date();
            expiryDate.setFullYear(expiryDate.getFullYear() + 1);
        }

        await db.query(
            `UPDATE members 
             SET membership_active = true, 
                 membership_expires_at = $1 
             WHERE id = $2`,
            [expiryDate, memberId]
        );

        await db.query(
            `INSERT INTO payments (member_id, amount, payment_type, transaction_reference) 
             VALUES ($1, $2, $3, $4)`,
            [memberId, amount, paymentType, transactionRef]
        );

        await db.query('COMMIT');
        return { success: true, expiryDate };
    } catch (error) {
        await db.query('ROLLBACK');
        throw error;
    }
};