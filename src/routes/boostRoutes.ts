import { Router } from 'express';
import { submitBoost } from '../services/boostService';

const router = Router();

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

export default router;