import axios from 'axios';
import { db } from '../models/db';

// USD Pricing
const MEMBERSHIP_FEE_USD = 50;   // Yearly membership
const MAINTENANCE_FEE_USD = 5;   // Monthly maintenance (starts 6 months after membership)

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;
const BASE_URL = process.env.BASE_URL || 'https://content-amplifier-hub.onrender.com';

/**
 * Returns the correct fee based on payment type.
 */
export const getMemberFee = async (
    memberId: number,
    type: 'registration' | 'maintenance'
): Promise<number> => {
    return type === 'registration' ? MEMBERSHIP_FEE_USD : MAINTENANCE_FEE_USD;
};

/**
 * Creates a Paystack transaction in USD.
 */
export const createPaystackTransaction = async (
    memberId: number,
    amountUsd: number,
    type: 'registration' | 'maintenance'
) => {
    const memberResult = await db.query(
        'SELECT email FROM members WHERE id = $1',
        [memberId]
    );

    const email = memberResult.rows[0]?.email;
    if (!email) throw new Error('Member not found');

    console.log(`[Paystack] Creating transaction for member ${memberId}, email ${email}, amount USD ${amountUsd}`);

    try {
        const response = await axios.post(
            'https://api.paystack.co/transaction/initialize',
            {
                email,
                amount: amountUsd * 100, // Paystack expects cents
                currency: 'USD',
                metadata: { memberId, type },
                callback_url: `${BASE_URL}/auth/payment/callback`,
            },
            {
                headers: {
                    Authorization: `Bearer ${PAYSTACK_SECRET}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        console.log('[Paystack] Response status:', response.status);
        console.log('[Paystack] Response data:', JSON.stringify(response.data));

        if (response.data.status) {
            return response.data.data.authorization_url;
        } else {
            throw new Error(response.data.message || 'Paystack initialization failed');
        }
    } catch (error: any) {
        console.error('[Paystack] API error:', error.response?.data || error.message);
        throw new Error(`Paystack error: ${error.response?.data?.message || error.message}`);
    }
};

/**
 * Verifies Paystack transaction.
 */
export const verifyPaystackTransaction = async (reference: string) => {
    const response = await axios.get(
        `https://api.paystack.co/transaction/verify/${reference}`,
        {
            headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
        }
    );

    if (response.data.status && response.data.data.status === 'success') {
        const { metadata, amount } = response.data.data;

        const memberId = metadata.memberId;
        const type = metadata.type;

        await activateMembership(memberId, amount / 100, type, reference);
        return { success: true };
    }

    return { success: false, message: 'Payment not successful' };
};

/**
 * Activates membership or maintenance after successful payment.
 */
export const activateMembership = async (
    memberId: number,
    amountUsd: number,
    paymentType: string,
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
        throw error;
    }
};