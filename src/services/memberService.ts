import { db } from '../models/db';

/**
 * Registers a new member in the database.
 * Sets membership_active, is_verified, and profile_complete to false by default.
 * Default member_type is 'creator'.
 */
export const registerNewMember = async (email: string, passwordHash: string) => {
    // 1. Create the member profile
    const newMember = await db.query(
        `INSERT INTO members (email, password_hash, membership_active, is_verified, profile_complete, member_type) 
         VALUES ($1, $2, false, false, false, 'creator') 
         RETURNING id, email, membership_active, is_verified, profile_complete, member_type`,
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