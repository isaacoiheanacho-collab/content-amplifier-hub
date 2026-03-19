import { db } from '../models/db'; // Using your corrected central connection

export const submitBoost = async (memberId: number, contentUrl: string, platform: string) => {
    // 1. Check if member has reached their 20-link monthly limit
    const memberCheck = await db.query(
        'SELECT monthly_boosts_used, membership_active FROM members WHERE id = $1',
        [memberId]
    );
    
    const member = memberCheck.rows[0];

    if (!member.membership_active) {
        return { success: false, message: "Account inactive. Please pay maintenance fee." };
    }

    if (member.monthly_boosts_used >= 20) {
        return { success: false, message: "Monthly limit of 20 links reached." };
    }

    // 2. Find the next available hourly slot (max 500 links per hour)
    // We look for the first hour from 'now' that has fewer than 500 entries
    const slotCheck = await db.query(`
        SELECT hour_slot FROM (
            SELECT generate_series(
                date_trunc('hour', now()), 
                date_trunc('hour', now()) + interval '24 hours', 
                interval '1 hour'
            ) AS hour_slot
        ) AS slots
        LEFT JOIN boosts ON boosts.hour_slot = slots.hour_slot
        GROUP BY slots.hour_slot
        HAVING count(boosts.id) < 500
        ORDER BY slots.hour_slot LIMIT 1
    `);

    const availableSlot = slotCheck.rows[0].hour_slot;

    // 3. Insert the boost and increment the member's counter
    await db.query('BEGIN'); // Start transaction for safety
    try {
        await db.query(
            'INSERT INTO boosts (member_id, content_url, platform, hour_slot) VALUES ($1, $2, $3, $4)',
            [memberId, contentUrl, platform, availableSlot]
        );
        
        await db.query(
            'UPDATE members SET monthly_boosts_used = monthly_boosts_used + 1 WHERE id = $1',
            [memberId]
        );
        
        await db.query('COMMIT');
        return { success: true, slot: availableSlot };
    } catch (error) {
        await db.query('ROLLBACK');
        throw error;
    }
};