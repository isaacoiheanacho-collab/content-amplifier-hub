import axios from 'axios';
import { db } from '../models/db';

// Amounts from environment
const EARLY_BIRD_FEE = parseInt(process.env.EARLY_BIRD_FEE || '5000');
const STANDARD_FEE = parseInt(process.env.STANDARD_FEE || '20000');
const MAINTENANCE_FEE = parseInt(process.env.MONTHLY_MAINTENANCE_FEE || '500');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;
const BASE_URL = process.env.BASE_URL || 'https://content-amplifier-hub.onrender.com';

export const getMemberFee = async (memberId: number): Promise<number> => {
    const result = await db.query('SELECT is_early_bird FROM members WHERE id = $1', [memberId]);
    const isEarlyBird = result.rows[0]?.is_early_bird;
    return isEarlyBird ? EARLY_BIRD_FEE : STANDARD_FEE;
};

export const createPaystackTransaction = async (
    memberId: number,
    amount: number,
    type: 'registration' | 'maintenance'
) => {
    const memberResult = await db.query('SELECT email FROM members WHERE id = $1', [memberId]);
    const email = memberResult.rows[0]?.email;
    if (!email) throw new Error('Member not found');

    const response = await axios.post(
        'https://api.paystack.co/transaction/initialize',
        {
            email,
            amount: amount * 100,
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

    if (response.data.status) {
        return response.data.data.authorization_url;
    } else {
        throw new Error(response.data.message || 'Paystack initialization failed');
    }
};

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

export const activateMembership = async (
    memberId: number,
    amount: number,
    paymentType: string,
    transactionRef: string
) => {
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

        // Update membership status + expiry
        await db.query(
            `UPDATE members 
             SET membership_active = true, 
                 membership_expires_at = $1 
             WHERE id = $2`,
            [expiryDate, memberId]
        );

        // Record payment and capture paid_at timestamp
        const paymentResult = await db.query(
            `INSERT INTO payments (member_id, amount, payment_type, transaction_reference) 
             VALUES ($1, $2, $3, $4)
             RETURNING paid_at`,
            [memberId, amount, paymentType, transactionRef]
        );

        const paidAt: Date = paymentResult.rows[0].paid_at;

        // FIRST MAINTENANCE: 6 months after registration payment
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
