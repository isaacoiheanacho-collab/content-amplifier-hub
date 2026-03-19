import { Router } from 'express';
import { submitBoost } from '../services/boostService';

const router = Router();

// This is the endpoint members will call to submit a link
router.post('/submit', async (req, res) => {
    const { memberId, contentUrl, platform } = req.body;
    try {
        const result = await submitBoost(memberId, contentUrl, platform);
        if (result.success) {
            res.status(200).json(result);
        } else {
            res.status(400).json({ error: result.message });
        }
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

export default router;