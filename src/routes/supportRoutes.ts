import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { db } from '../models/db';

const router = Router();

// Helper: recalc points and stars from confirmed engagements
async function recalcPointsAndStars(supportId: number) {
    const countResult = await db.query(
        `SELECT COUNT(*) FROM support_engagements
         WHERE support_member_id = $1 AND confirmed = true`,
        [supportId]
    );
    const totalConfirmed = parseInt(countResult.rows[0].count);
    const points = Math.floor(totalConfirmed / 3); // 3 engagements = 1 point (1 cent)
    const stars = points / 100; // 100 points = 1 star
    await db.query(
        `UPDATE members SET points = $1, stars = $2 WHERE id = $3 AND member_type = 'support'`,
        [points, stars, supportId]
    );
    return { points, stars };
}

// GET /support/available-boosts
router.get('/available-boosts', authenticate, async (req: AuthRequest, res) => {
    const supportId = req.user.id;

    const member = await db.query(
        `SELECT member_type FROM members WHERE id = $1`,
        [supportId]
    );
    if (member.rows[0]?.member_type !== 'support') {
        return res.status(403).json({ error: 'Only support members can access this endpoint' });
    }

    const boosts = await db.query(
        `SELECT b.id, b.content_url, b.platform, b.category, b.submitted_at
         FROM boosts b
         WHERE b.status = 'approved'
           AND NOT EXISTS (
               SELECT 1 FROM support_engagements se
               WHERE se.support_member_id = $1 AND se.boost_id = b.id
           )
         ORDER BY b.submitted_at DESC`,
        [supportId]
    );

    res.json({ boosts: boosts.rows });
});

// POST /support/record-click
router.post('/record-click', authenticate, async (req: AuthRequest, res) => {
    const supportId = req.user.id;
    const { boostId } = req.body;

    if (!boostId) return res.status(400).json({ error: 'boostId required' });

    await db.query(
        `INSERT INTO support_engagements (support_member_id, boost_id, clicked_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (support_member_id, boost_id) DO UPDATE
         SET clicked_at = EXCLUDED.clicked_at`,
        [supportId, boostId]
    );

    res.json({ success: true });
});

// POST /support/confirm-engagement
router.post('/confirm-engagement', authenticate, async (req: AuthRequest, res) => {
    const supportId = req.user.id;
    const { boostId } = req.body;

    if (!boostId) return res.status(400).json({ error: 'boostId required' });

    const engagement = await db.query(
        `SELECT clicked_at, confirmed FROM support_engagements
         WHERE support_member_id = $1 AND boost_id = $2`,
        [supportId, boostId]
    );

    if (engagement.rows.length === 0) {
        return res.status(400).json({ error: 'No click recorded for this boost' });
    }
    if (engagement.rows[0].confirmed === true) {
        return res.status(400).json({ error: 'Engagement already confirmed' });
    }

    const clickedAt = new Date(engagement.rows[0].clicked_at);
    const now = new Date();
    const secondsDiff = (now.getTime() - clickedAt.getTime()) / 1000;
    if (secondsDiff < 30) {
        return res.status(400).json({ error: `Please wait ${30 - Math.floor(secondsDiff)} more seconds` });
    }

    await db.query(
        `UPDATE support_engagements SET confirmed = true, confirmed_at = NOW()
         WHERE support_member_id = $1 AND boost_id = $2`,
        [supportId, boostId]
    );

    const { points, stars } = await recalcPointsAndStars(supportId);

    res.json({ success: true, points, stars });
});

// GET /support/stats
router.get('/stats', authenticate, async (req: AuthRequest, res) => {
    const supportId = req.user.id;
    const member = await db.query(
        `SELECT points, stars, bank_account_info IS NOT NULL as has_bank_info
         FROM members WHERE id = $1 AND member_type = 'support'`,
        [supportId]
    );
    if (member.rows.length === 0) {
        return res.status(404).json({ error: 'Support member not found' });
    }
    const supportsGiven = await db.query(
        `SELECT COUNT(*) FROM support_engagements
         WHERE support_member_id = $1 AND confirmed = true`,
        [supportId]
    );
    res.json({
        points: member.rows[0].points,
        stars: member.rows[0].stars,
        supportsGiven: parseInt(supportsGiven.rows[0].count),
        hasBankInfo: member.rows[0].has_bank_info
    });
});

// POST /support/bank-info
router.post('/bank-info', authenticate, async (req: AuthRequest, res) => {
    const supportId = req.user.id;
    const { bankAccountInfo } = req.body;
    if (!bankAccountInfo) return res.status(400).json({ error: 'Bank info required' });
    await db.query(
        `UPDATE members SET bank_account_info = $1 WHERE id = $2`,
        [bankAccountInfo, supportId]
    );
    res.json({ success: true });
});

// POST /support/claim-reward
router.post('/claim-reward', authenticate, async (req: AuthRequest, res) => {
    const supportId = req.user.id;
    const member = await db.query(
        `SELECT stars, bank_account_info FROM members WHERE id = $1`,
        [supportId]
    );
    const stars = member.rows[0].stars;
    if (stars < 20) {
        return res.status(400).json({ error: `Need 20 stars to claim. You have ${stars}` });
    }
    if (!member.rows[0].bank_account_info) {
        return res.status(400).json({ error: 'Please add bank account info before claiming' });
    }
    await db.query(`UPDATE members SET stars = stars - 20 WHERE id = $1`, [supportId]);
    // TODO: Initiate payment (Stripe/PayPal)
    res.json({ success: true, message: 'Claim submitted. $20 will be sent within 5-7 days.' });
});

export default router;