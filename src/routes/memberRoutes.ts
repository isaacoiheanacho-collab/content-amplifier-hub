import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { db } from '../models/db';

const router = Router();

router.get('/stats', authenticate, async (req: AuthRequest, res) => {
    const memberId = req.user.id;
    const memberResult = await db.query(
        'SELECT email, membership_active, monthly_boosts_used, supports_given FROM members WHERE id = $1',
        [memberId]
    );
    if (memberResult.rows.length === 0) {
        return res.status(404).json({ error: 'Member not found' });
    }
    const member = memberResult.rows[0];
    const supportsReceivedResult = await db.query(
        'SELECT COALESCE(SUM(confirmed_supports_count), 0) as total FROM boosts WHERE member_id = $1',
        [memberId]
    );
    const supportsReceived = supportsReceivedResult.rows[0].total;

    res.json({
        email: member.email,
        membership_active: member.membership_active,
        monthly_boosts_used: member.monthly_boosts_used,
        max_monthly_boosts: process.env.MAX_MONTHLY_BOOSTS || 20,
        supports_given: member.supports_given,
        supports_received: supportsReceived,
    });
});

router.get('/boosts', authenticate, async (req: AuthRequest, res) => {
    const memberId = req.user.id;
    const boosts = await db.query(
        `SELECT * FROM boosts WHERE member_id = $1 ORDER BY submitted_at DESC`,
        [memberId]
    );
    res.json(boosts.rows);
});

export default router;