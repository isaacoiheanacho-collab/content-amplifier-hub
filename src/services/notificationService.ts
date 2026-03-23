import admin from 'firebase-admin';
import { db } from '../models/db';

// Initialize Firebase Admin SDK only once
if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}

export const sendNotificationToAll = async (title: string, body: string) => {
    const result = await db.query('SELECT fcm_token FROM members WHERE fcm_token IS NOT NULL');
    const tokens = result.rows.map(row => row.fcm_token);
    if (tokens.length === 0) return;

    const message = {
        notification: { title, body },
        tokens,
    };
    try {
        const response = await admin.messaging().sendEachForMulticast(message);
        console.log(`Sent to ${response.successCount} devices, failed: ${response.failureCount}`);
    } catch (error) {
        console.error('Error sending push notifications:', error);
    }
};

export const sendNotificationToMember = async (memberId: number, title: string, body: string) => {
    const result = await db.query('SELECT fcm_token FROM members WHERE id = $1', [memberId]);
    const token = result.rows[0]?.fcm_token;
    if (!token) return;

    const message = {
        notification: { title, body },
        token,
    };
    try {
        await admin.messaging().send(message);
        console.log(`Notification sent to member ${memberId}`);
    } catch (error) {
        console.error(`Error sending notification to member ${memberId}:`, error);
    }
};