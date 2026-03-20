import { db } from '../models/db';
import cron from 'node-cron';

const MAX_HOURLY_QUEUE = parseInt(process.env.MAX_HOURLY_QUEUE || '500');

// This runs every hour (at minute 0)
cron.schedule('0 * * * *', async () => {
    console.log('Running hourly engine...');
    try {
        // Get the current hour (rounded down)
        const now = new Date();
        const currentHour = new Date(now);
        currentHour.setMinutes(0, 0, 0);

        // Find up to MAX_HOURLY_QUEUE queued boosts, oldest first
        const queuedBoosts = await db.query(
            `SELECT id FROM boosts 
             WHERE status = 'queued' 
             ORDER BY submitted_at ASC 
             LIMIT $1`,
            [MAX_HOURLY_QUEUE]
        );

        if (queuedBoosts.rows.length === 0) {
            console.log('No queued boosts to process.');
            return;
        }

        const boostIds = queuedBoosts.rows.map(row => row.id);

        // Update them to approved, set hour_slot to current hour
        await db.query(
            `UPDATE boosts 
             SET status = 'approved', hour_slot = $1 
             WHERE id = ANY($2::int[])`,
            [currentHour, boostIds]
        );

        console.log(`Approved ${boostIds.length} boosts for hour ${currentHour.toISOString()}`);

        // TODO: Trigger push notifications (will be added later)
    } catch (err) {
        console.error('Hourly engine failed:', err);
    }
});