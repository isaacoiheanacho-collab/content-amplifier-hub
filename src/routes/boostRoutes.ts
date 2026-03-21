import { Router } from 'express';
import { submitBoost, getLiveBoosts, recordSupportClick, recordConfirmedSupport } from '../services/boostService';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// Existing submit route (no auth required, but could be added later)
router.post('/submit', async (req, res) => {
    const { memberId, contentUrl, platform, category } = req.body;
    try {
        const result = await submitBoost(memberId, contentUrl, platform, category);
        if (result.success) {
            res.status(200).json(result);
        } else {
            res.status(400).json({ error: result.message });
        }
    } catch (error) {
        console.error('Boost submission error:', error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// GET /boosts/live – get current hour's boosts
router.get('/live', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit as string) || 20;
        const boosts = await getLiveBoosts(limit);
        res.json(boosts);
    } catch (error) {
        console.error('Error fetching live boosts:', error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// POST /boosts/:id/support – record a click (support now)
router.post('/:id/support', authenticate, async (req: AuthRequest, res) => {
    const boostId = parseInt(req.params.id);
    const memberId = req.user.id; // from JWT
    try {
        const result = await recordSupportClick(boostId, memberId);
        res.json(result);
    } catch (error) {
        console.error('Error recording support click:', error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// POST /boosts/:id/confirm – record confirmed support
router.post('/:id/confirm', authenticate, async (req: AuthRequest, res) => {
    const boostId = parseInt(req.params.id);
    const memberId = req.user.id;
    try {
        const result = await recordConfirmedSupport(boostId, memberId);
        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json({ error: result.message });
        }
    } catch (error) {
        console.error('Error recording confirmed support:', error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

export default router;