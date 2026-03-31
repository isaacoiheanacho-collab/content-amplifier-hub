import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { db } from '../models/db';

const router = Router();

/**
 * GET /member/stats
 * Existing endpoint — unchanged
 */
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

/**
 * GET /member/boosts
 * Existing endpoint — unchanged
 */
router.get('/boosts', authenticate, async (req: AuthRequest, res) => {
    const memberId = req.user.id;

    const boosts = await db.query(
        `SELECT * FROM boosts WHERE member_id = $1 ORDER BY submitted_at DESC`,
        [memberId]
    );

    res.json(boosts.rows);
});

/**
 * NEW: GET /member/profile
 * Returns full profile including new fields
 */
router.get('/profile', authenticate, async (req: AuthRequest, res) => {
    const memberId = req.user.id;

    const result = await db.query(
        `SELECT email, name, phone, region, profile_photo_url,
                membership_active, monthly_boosts_used, supports_given
         FROM members WHERE id = $1`,
        [memberId]
    );

    if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Member not found' });
    }

    const member = result.rows[0];

    const supportsReceivedResult = await db.query(
        'SELECT COALESCE(SUM(confirmed_supports_count), 0) as total FROM boosts WHERE member_id = $1',
        [memberId]
    );

    res.json({
        ...member,
        supports_received: supportsReceivedResult.rows[0].total,
        max_monthly_boosts: process.env.MAX_MONTHLY_BOOSTS || 20
    });
});

/**
 * NEW: POST /member/profile/update
 * Updates name, phone, region, profile photo URL
 */
router.post('/profile/update', authenticate, async (req: AuthRequest, res) => {
    const memberId = req.user.id;
    const { name, phone, region, profile_photo_url } = req.body;

    await db.query(
        `UPDATE members
         SET name = $1, phone = $2, region = $3, profile_photo_url = $4
         WHERE id = $5`,
        [name, phone, region, profile_photo_url, memberId]
    );

    res.json({ success: true });
});

export default router;
