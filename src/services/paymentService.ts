import Stripe from 'stripe';
import { db } from '../models/db';

// USD Pricing
const MEMBERSHIP_FEE_USD = 50;   // Yearly membership
const MAINTENANCE_FEE_USD = 5;   // Monthly maintenance

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-03-25.dahlia',
});

// This should be your backend/base app URL (Render)
const BASE_URL = process.env.BASE_URL || 'https://content-amplifier-hub.onrender.com';

/**
 * Returns the correct fee based on payment type.
 */
export const getMemberFee = async (
    memberId: number,
    type: 'registration' | 'maintenance'
): Promise<number> => {
    // You can later make this dynamic per member if needed
    return type === 'registration' ? MEMBERSHIP_FEE_USD : MAINTENANCE_FEE_USD;
};

/**
 * Creates a Stripe Checkout session.
 * Backend state changes are handled ONLY via webhook, not via success_url.
 */
export const createStripeCheckoutSession = async (
    memberId: number,
    amountUsd: number,
    type: 'registration' | 'maintenance'
): Promise<string> => {
    const memberResult = await db.query(
        'SELECT email FROM members WHERE id = $1',
        [memberId]
    );

    const email = memberResult.rows[0]?.email;
    if (!email) throw new Error('Member not found');

    console.log(
        `[Stripe] Creating checkout session for member ${memberId}, ` +
        `email ${email}, amount USD ${amountUsd}, type ${type}`
    );

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: type === 'registration'
                                ? 'Yearly Membership'
                                : 'Monthly Maintenance',
                        },
                        unit_amount: amountUsd * 100, // cents
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            // These URLs are now purely for UX; backend updates happen via webhook
            success_url: `${BASE_URL}/payment/success`,
            cancel_url: `${BASE_URL}/payment/cancel`,
            metadata: {
                memberId: memberId.toString(),
                type: type,
            },
            customer_email: email,
        });

        console.log('[Stripe] Checkout session created:', session.id);
        if (!session.url) {
            throw new Error('Stripe session URL is missing');
        }

        return session.url;
    } catch (error: any) {
        console.error('[Stripe] Error creating checkout session:', error);
        throw new Error(`Stripe error: ${error.message}`);
    }
};

/**
 * Verifies a Stripe Checkout Session and activates membership/maintenance.
 * This is intended to be called from the Stripe webhook handler.
 */
export const verifyStripeSession = async (sessionId: string) => {
    try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (session.payment_status !== 'paid') {
            return { success: false, message: 'Payment not successful' };
        }

        if (!session.metadata) {
            console.error('[Stripe] Session metadata missing for', sessionId);
            return { success: false, message: 'Missing session metadata' };
        }

        const memberIdRaw = session.metadata.memberId;
        const type = session.metadata.type as 'registration' | 'maintenance' | undefined;

        if (!memberIdRaw || !type) {
            console.error('[Stripe] Invalid metadata for session', sessionId, session.metadata);
            return { success: false, message: 'Invalid session metadata' };
        }

        const memberId = parseInt(memberIdRaw, 10);
        if (Number.isNaN(memberId)) {
            console.error('[Stripe] Invalid memberId in metadata for session', sessionId, memberIdRaw);
            return { success: false, message: 'Invalid member ID in metadata' };
        }

        const amountUsd = (session.amount_total ?? 0) / 100;

        console.log(
            `[Stripe] Verifying session ${sessionId} for member ${memberId}, ` +
            `type ${type}, amountUsd ${amountUsd}`
        );

        await activateMembership(memberId, amountUsd, type, sessionId);
        return { success: true };
    } catch (error: any) {
        console.error('[Stripe] Verification error:', error);
        return { success: false, message: error.message };
    }
};

/**
 * Activates membership or maintenance after successful payment.
 * This is called only after Stripe confirms payment (via webhook).
 */
export const activateMembership = async (
    memberId: number,
    amountUsd: number,
    paymentType: 'registration' | 'maintenance',
    transactionRef: string
) => {
    try {
        await db.query('BEGIN');

        let expiryDate: Date;

        // Membership lasts 1 year
        if (paymentType === 'registration') {
            expiryDate = new Date();
            expiryDate.setFullYear(expiryDate.getFullYear() + 1);
        }
        // Maintenance lasts 1 month
        else {
            expiryDate = new Date();
            expiryDate.setMonth(expiryDate.getMonth() + 1);
        }

        // Update membership status
        await db.query(
            `UPDATE members 
             SET membership_active = true,
                 membership_expires_at = $1
             WHERE id = $2`,
            [expiryDate, memberId]
        );

        // Record payment
        const paymentResult = await db.query(
            `INSERT INTO payments (member_id, amount, payment_type, transaction_reference)
             VALUES ($1, $2, $3, $4)
             RETURNING paid_at`,
            [memberId, amountUsd, paymentType, transactionRef]
        );

        const paidAt: Date = paymentResult.rows[0].paid_at;

        // FIRST MAINTENANCE: 6 months after membership
        if (paymentType === 'registration') {
            const firstMaintenanceDue = new Date(paidAt);
            firstMaintenanceDue.setMonth(firstMaintenanceDue.getMonth() + 6);

            await db.query(
                `UPDATE members 
                 SET next_maintenance_due = $1
                 WHERE id = $2`,
                [firstMaintenanceDue, memberId]
            );
        }
        // SUBSEQUENT MAINTENANCE: monthly
        else if (paymentType === 'maintenance') {
            await db.query(
                `UPDATE members 
                 SET next_maintenance_due = 
                     COALESCE(next_maintenance_due, $1) + INTERVAL '1 month'
                 WHERE id = $2`,
                [paidAt, memberId]
            );
        }

        await db.query('COMMIT');
        return { success: true, expiryDate };
    } catch (error) {
        await db.query('ROLLBACK');
        console.error('[Stripe] activateMembership error:', error);
        throw error;
    }
};
