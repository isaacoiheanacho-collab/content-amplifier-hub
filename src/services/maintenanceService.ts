import { db } from '../models/db';

export const checkAccess = async (memberId: number) => {
    try {
        const res = await db.query(
            'SELECT membership_active, next_maintenance_due FROM members WHERE id = $1',
            [memberId]
        );
        
        if (res.rowCount === 0) return { allowed: false, reason: "Member not found" };

        const member = res.rows[0];
        const now = new Date();

        // 1. Check if they are generally active
        // 2. Check if their maintenance date has passed
        if (!member.membership_active || (member.next_maintenance_due && now > member.next_maintenance_due)) {
            return { allowed: false, reason: "Monthly maintenance fee (500 Naira) required" };
        }

        return { allowed: true };
    } catch (err) {
        console.error('Error checking maintenance status:', err);
        return { allowed: false, reason: "System error" };
    }
};