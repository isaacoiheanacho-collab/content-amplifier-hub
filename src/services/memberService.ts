import { db } from '../models/db';

/**
 * Registers a new member in the database.
 * Sets membership_active and is_verified to false by default.
 * These are updated later via Stripe webhooks and OTP verification respectively.
 */
export const registerNewMember = async (email: string, passwordHash: string) => {
    // 1. Create the member profile
    const newMember = await db.query(
        `INSERT INTO members (email, password_hash, membership_active, is_verified) 
         VALUES ($1, $2, false, false) 
         RETURNING id, email`,
        [email, passwordHash]
    );

    // 2. Increment total registered members (for analytics only)
    await db.query(
        'UPDATE app_stats SET total_registered_members = total_registered_members + 1'
    );

    // 3. Return the member data and payment constants for the auth route
    return {
        member: newMember.rows[0],
        amountToPay: 50,     // USD
        maintenanceFee: 5    // USD
    };
};