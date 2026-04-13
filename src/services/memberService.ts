import { db } from '../models/db';

/**
 * Registers a new member in the database.
 * Sets membership_active, is_verified, and profile_complete to false by default.
 */
export const registerNewMember = async (email: string, passwordHash: string) => {
    // 1. Create the member profile
    // Note: Added profile_complete: false to ensure the logic matches frontend checks
    const newMember = await db.query(
        `INSERT INTO members (email, password_hash, membership_active, is_verified, profile_complete) 
         VALUES ($1, $2, false, false, false) 
         RETURNING id, email, membership_active, is_verified, profile_complete`,
        [email, passwordHash]
    );

    // 2. Increment total registered members (for analytics only)
    await db.query(
        'UPDATE app_stats SET total_registered_members = total_registered_members + 1'
    );

    // 3. Return the member data and payment constants
    return {
        member: newMember.rows[0],
        amountToPay: 50,     // USD
        maintenanceFee: 5    // USD
    };
};