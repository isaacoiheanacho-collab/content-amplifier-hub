import { db } from '../models/db';

export const submitBoost = async (memberId: number, contentUrl: string, platform: string, category: string) => {
    try {
        // 1. Check member status and monthly limit
        const memberCheck = await db.query(
            'SELECT monthly_boosts_used, membership_active FROM members WHERE id = $1',
            [memberId]
        );

        if (memberCheck.rows.length === 0) {
            return { success: false, message: "Member not found." };
        }

        const member = memberCheck.rows[0];

        if (!member.membership_active) {
            return { success: false, message: "Account inactive. Please pay maintenance fee." };
        }

        const maxMonthlyBoosts = parseInt(process.env.MAX_MONTHLY_BOOSTS || '20');
        if (member.monthly_boosts_used >= maxMonthlyBoosts) {
            return { success: false, message: `Monthly limit of ${maxMonthlyBoosts} links reached.` };
        }

        // 2. Find next available hourly slot (max 500 per hour)
        const maxHourlyQueue = parseInt(process.env.MAX_HOURLY_QUEUE || '500');
        const slotCheck = await db.query(`
            SELECT slots.hour_slot
            FROM (
                SELECT generate_series(
                    date_trunc('hour', now()), 
                    date_trunc('hour', now()) + interval '24 hours', 
                    interval '1 hour'
                ) AS hour_slot
            ) AS slots
            LEFT JOIN boosts ON boosts.hour_slot = slots.hour_slot
            GROUP BY slots.hour_slot
            HAVING count(boosts.id) < $1
            ORDER BY slots.hour_slot
            LIMIT 1
        `, [maxHourlyQueue]);

        if (slotCheck.rows.length === 0) {
            return { success: false, message: "No available slots in the next 24 hours. Please try again later." };
        }

        const availableSlot = slotCheck.rows[0].hour_slot;

        // 3. Insert boost and update member counter
        await db.query('BEGIN');
        try {
            await db.query(
                'INSERT INTO boosts (member_id, content_url, platform, category, hour_slot, status) VALUES ($1, $2, $3, $4, $5, $6)',
                [memberId, contentUrl, platform, category, availableSlot, 'queued']
            );

            await db.query(
                'UPDATE members SET monthly_boosts_used = monthly_boosts_used + 1 WHERE id = $1',
                [memberId]
            );

            await db.query('COMMIT');
            return { success: true, slot: availableSlot };
        } catch (insertError) {
            await db.query('ROLLBACK');
            throw insertError;
        }
    } catch (error) {
        console.error('Error in submitBoost:', error);
        throw error;
    }
};

// Get boosts that are approved and whose hour_slot matches the current hour
export const getLiveBoosts = async (limit: number = 20) => {
    const now = new Date();
    const currentHour = new Date(now);
    currentHour.setMinutes(0, 0, 0);

    const result = await db.query(
        `SELECT id, member_id, content_url, platform, category, impressions_count, clicks_count, confirmed_supports_count
         FROM boosts
         WHERE status = 'approved' AND hour_slot = $1
         ORDER BY submitted_at ASC
         LIMIT $2`,
        [currentHour, limit]
    );
    return result.rows;
};

// Record that a member clicked "Support Now" (increments clicks_count)
export const recordSupportClick = async (boostId: number, memberId: number) => {
    await db.query(
        `UPDATE boosts SET clicks_count = clicks_count + 1 WHERE id = $1`,
        [boostId]
    );
    return { success: true };
};

// Record that a member confirmed they supported (liked, commented, etc.)
export const recordConfirmedSupport = async (boostId: number, memberId: number) => {
    // Check if this member already confirmed this boost
    const existing = await db.query(
        `SELECT id FROM support_log WHERE boost_id = $1 AND member_id = $2 AND confirmed = true`,
        [boostId, memberId]
    );
    if (existing.rows.length > 0) {
        return { success: false, message: "You have already supported this boost." };
    }

    await db.query('BEGIN');
    try {
        // Insert into support_log
        await db.query(
            `INSERT INTO support_log (boost_id, member_id, confirmed) VALUES ($1, $2, true)`,
            [boostId, memberId]
        );
        // Increment confirmed_supports_count on the boost
        await db.query(
            `UPDATE boosts SET confirmed_supports_count = confirmed_supports_count + 1 WHERE id = $1`,
            [boostId]
        );
        // Increment supports_given on the member
        await db.query(
            `UPDATE members SET supports_given = supports_given + 1 WHERE id = $1`,
            [memberId]
        );
        await db.query('COMMIT');
        return { success: true };
    } catch (error) {
        await db.query('ROLLBACK');
        throw error;
    }
};