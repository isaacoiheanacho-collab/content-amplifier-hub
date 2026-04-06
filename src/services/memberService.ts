import { db } from '../models/db';

export const registerNewMember = async (email: string, passwordHash: string) => {
    // 1. Check current total to see if we are still in the "Early Bird" phase (under 10k)
    const statsResult = await db.query('SELECT total_registered_members FROM app_stats LIMIT 1');
    const totalMembers = statsResult.rows[0].total_registered_members;

    // 2. Determine the Rule: First 10,000 get the 5,000 Naira rate, then 20,000
    const isEarlyBird = totalMembers < 10000;
    const registrationFee = isEarlyBird ? 5000 : 20000;

    // 3. Create the member profile (Starts as FALSE until they pay the fee)
    const newMember = await db.query(
        `INSERT INTO members (email, password_hash, is_early_bird, membership_active) 
         VALUES ($1, $2, $3, false) 
         RETURNING id, email, is_early_bird`,
        [email, passwordHash, isEarlyBird]
    );

    // 4. Update the counter so the next person is counted correctly
    await db.query('UPDATE app_stats SET total_registered_members = total_registered_members + 1');

    // 5. Return registration fee and maintenance fee (fixed at 500)
    return {
        member: newMember.rows[0],
        amountToPay: registrationFee,
        maintenanceFee: 500
    };
};