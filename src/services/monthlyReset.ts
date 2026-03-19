import { db } from '../models/db';
import cron from 'node-cron';

// This runs at 00:00 (Midnight) on day 1 of every month
cron.schedule('0 0 1 * *', async () => {
    console.log('Running Monthly Boost Reset...');
    try {
        // Sets everyone back to 0 so they can use their 20 boosts for the new month
        await db.query('UPDATE members SET monthly_boosts_used = 0');
        console.log('All member boost counts have been reset to 0.');
    } catch (err) {
        console.error('Monthly reset failed:', err);
    }
});