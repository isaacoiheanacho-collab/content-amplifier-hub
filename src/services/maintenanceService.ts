import { db } from '../models/db';

export const checkAccess = async (memberId: number) => {
  try {
    const res = await db.query(
      `SELECT membership_active, next_maintenance_due 
       FROM members 
       WHERE id = $1`,
      [memberId]
    );

    if (res.rowCount === 0) {
      return { allowed: false, reason: 'Member not found' };
    }

    const member = res.rows[0];
    const now = new Date();

    // If membership is not active, registration fee not paid
    if (!member.membership_active) {
      return { allowed: false, reason: 'Registration fee required' };
    }

    // If next_maintenance_due is null, maintenance not yet scheduled
    if (!member.next_maintenance_due) {
      return {
        allowed: true,
        reason: 'Maintenance not yet scheduled',
      };
    }

    const nextDue = new Date(member.next_maintenance_due);

    // If overdue → block access
    if (now > nextDue) {
      return {
        allowed: false,
        reason: 'Monthly maintenance fee (500 Naira) required',
        nextDue,
      };
    }

    // Otherwise → access allowed
    return {
      allowed: true,
      reason: 'Maintenance up to date',
      nextDue,
    };
  } catch (err) {
    console.error('Error checking maintenance status:', err);
    return { allowed: false, reason: 'System error' };
  }
};
