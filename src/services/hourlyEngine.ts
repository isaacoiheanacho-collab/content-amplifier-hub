import { db } from '../models/db';
import cron from 'node-cron';
import { sendNotificationToAll } from './notificationService';

const MAX_HOURLY_QUEUE = parseInt(process.env.MAX_HOURLY_QUEUE || '500');

// This runs every hour (at minute 0)
cron.schedule('0 * * * *', async () => {
    console.log('Running hourly engine...');
    try {
        const now = new Date();
        const currentHour = new Date(now);
        currentHour.setMinutes(0, 0, 0);

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

        await db.query(
            `UPDATE boosts 
             SET status = 'approved', hour_slot = $1 
             WHERE id = ANY($2::int[])`,
            [currentHour, boostIds]
        );

        console.log(`Approved ${boostIds.length} boosts for hour ${currentHour.toISOString()}`);

        // Send push notifications to all members with tokens
        await sendNotificationToAll('New Boosts Live', 'Support your fellow creators now!');
    } catch (err) {
        console.error('Hourly engine failed:', err);
    }
});