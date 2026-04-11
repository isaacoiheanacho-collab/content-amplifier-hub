import { db } from '../models/db';

export const registerNewMember = async (email: string, passwordHash: string) => {
    // 1. Create the member profile (membership inactive until Stripe payment)
    const newMember = await db.query(
        `INSERT INTO members (email, password_hash, membership_active) 
         VALUES ($1, $2, false) 
         RETURNING id, email`,
        [email, passwordHash]
    );

    // 2. Increment total registered members (for analytics only)
    await db.query(
        'UPDATE app_stats SET total_registered_members = total_registered_members + 1'
    );

    // 3. Unified membership fee (Stripe handles USD)
    return {
        member: newMember.rows[0],
        amountToPay: 50,     // USD
        maintenanceFee: 5    // USD
    };
};
