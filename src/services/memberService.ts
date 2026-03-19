import { Pool } from 'pg';
const db = new Pool({ connectionString: process.env.DATABASE_URL });

export const registerNewMember = async (email: string, passwordHash: string) => {
    // 1. Check current total to see if we are still in the "Early Bird" phase
    const statsResult = await db.query('SELECT total_registered_members FROM app_stats LIMIT 1');
    const totalMembers = statsResult.rows[0].total_registered_members;

    // 2. Determine the Rule: First 10,000 get the 5,000 Naira rate
    const isEarlyBird = totalMembers < 10000;
    const registrationFee = isEarlyBird ? 5000 : 20000;

    // 3. Create the member profile (Status is inactive until payment is confirmed)
    const newMember = await db.query(
        `INSERT INTO members (email, password_hash, is_early_bird, membership_active) 
         VALUES ($1, $2, $3, false) RETURNING id, email, is_early_bird`,
        [email, passwordHash, isEarlyBird]
    );

    // 4. Update the counter for the next person
    await db.query('UPDATE app_stats SET total_registered_members = total_registered_members + 1');

    return {
        member: newMember.rows[0],
        amountToPay: registrationFee,
        maintenanceFee: 500
    };
};