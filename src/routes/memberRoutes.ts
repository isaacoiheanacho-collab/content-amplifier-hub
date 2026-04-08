import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { db } from '../models/db';
import cloudinary from '../utils/cloudinary';
import { upload } from '../utils/multer';
import { createPaystackTransaction } from '../services/paymentService';

const router = Router();

/**
 * GET /member/maintenance-status/:id
 */
router.get('/maintenance-status/:id', authenticate, async (req: AuthRequest, res) => {
    const { id } = req.params;

    try {
        const result = await db.query(
            `SELECT next_maintenance_due, membership_active 
             FROM members WHERE id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Member not found' });
        }

        const member = result.rows[0];
        const now = new Date();
        const nextDue = member.next_maintenance_due;

        const isAllowed = member.membership_active && nextDue
            ? now < new Date(nextDue)
            : false;

        res.json({
            allowed: isAllowed,
            nextDue: nextDue,
            reason: isAllowed
                ? "Maintenance Fee is Up to Date"
                : "Your monthly maintenance fee of ₦500 is due."
        });
    } catch (error) {
        console.error("Maintenance Status Error:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /member/stats
 */
router.get('/stats', authenticate, async (req: AuthRequest, res) => {
    const memberId = req.user.id;

    const memberResult = await db.query(
        `SELECT email, membership_active, monthly_boosts_used, supports_given 
         FROM members WHERE id = $1`,
        [memberId]
    );

    if (memberResult.rows.length === 0) {
        return res.status(404).json({ error: 'Member not found' });
    }

    const member = memberResult.rows[0];

    const supportsReceivedResult = await db.query(
        `SELECT COALESCE(SUM(confirmed_supports_count), 0) AS total 
         FROM boosts WHERE member_id = $1`,
        [memberId]
    );

    res.json({
        email: member.email,
        membership_active: member.membership_active,
        monthly_boosts_used: member.monthly_boosts_used,
        max_monthly_boosts: process.env.MAX_MONTHLY_BOOSTS || 20,
        supports_given: member.supports_given,
        supports_received: supportsReceivedResult.rows[0].total
    });
});

/**
 * GET /member/boosts
 */
router.get('/boosts', authenticate, async (req: AuthRequest, res) => {
    const memberId = req.user.id;

    const boosts = await db.query(
        `SELECT * FROM boosts 
         WHERE member_id = $1 
         ORDER BY submitted_at DESC`,
        [memberId]
    );

    res.json(boosts.rows);
});

/**
 * GET /member/profile
 */
router.get('/profile', authenticate, async (req: AuthRequest, res) => {
    const memberId = req.user.id;

    const result = await db.query(
        `SELECT email, name, phone, region, profile_photo_url,
                youtube_url, facebook_url, tiktok_url,
                membership_active, monthly_boosts_used, supports_given
         FROM members WHERE id = $1`,
        [memberId]
    );

    if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Member not found' });
    }

    const supportsReceivedResult = await db.query(
        `SELECT COALESCE(SUM(confirmed_supports_count), 0) AS total 
         FROM boosts WHERE member_id = $1`,
        [memberId]
    );

    res.json({
        ...result.rows[0],
        supports_received: supportsReceivedResult.rows[0].total,
        max_monthly_boosts: process.env.MAX_MONTHLY_BOOSTS || 20
    });
});

/**
 * POST /member/profile/update
 */
router.post('/profile/update', authenticate, upload.single('photo'), async (req: AuthRequest, res) => {
    const memberId = req.user.id;

    const { 
        name, 
        phone, 
        region, 
        profile_photo_url,
        youtube_url,
        facebook_url,
        tiktok_url
    } = req.body;

    let finalPhotoUrl = profile_photo_url;

    try {
        if (req.file) {
            const uploadPromise = new Promise<string>((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream(
                    { folder: 'profile_photos' },
                    (error, result) => {
                        if (error || !result) reject(error);
                        else resolve(result.secure_url);
                    }
                );
                uploadStream.end(req.file!.buffer);
            });
            
            finalPhotoUrl = await uploadPromise;
        }

        await db.query(
            `UPDATE members 
             SET name = $1, phone = $2, region = $3, profile_photo_url = $4,
                 youtube_url = $5, facebook_url = $6, tiktok_url = $7
             WHERE id = $8`,
            [
                name, 
                phone, 
                region, 
                finalPhotoUrl,
                youtube_url,
                facebook_url,
                tiktok_url,
                memberId
            ]
        );

        res.json({ success: true, profile_photo_url: finalPhotoUrl });
    } catch (error) {
        console.error("Profile Update Error:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /member/profile/upload-photo
 */
router.post('/profile/upload-photo', authenticate, upload.single('photo'), async (req: AuthRequest, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const uploadStream = cloudinary.uploader.upload_stream(
            { folder: 'profile_photos' },
            async (error, result) => {
                if (error || !result) {
                    console.error(error);
                    return res.status(500).json({ error: 'Cloudinary upload failed' });
                }

                const imageUrl = result.secure_url;

                await db.query(
                    `UPDATE members SET profile_photo_url = $1 WHERE id = $2`,
                    [imageUrl, req.user.id]
                );

                return res.json({ url: imageUrl });
            }
        );

        uploadStream.end(req.file.buffer);

    } catch (error) {
        console.error("Photo Upload Error:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /member/payment-url
 * Generates a Paystack payment link for membership activation
 */
router.post('/payment-url', authenticate, async (req: AuthRequest, res) => {
    const memberId = req.user.id;

    try {
        const result = await db.query(
            `SELECT is_early_bird 
             FROM members WHERE id = $1`,
            [memberId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Member not found' });
        }

        const member = result.rows[0];

        const amountToPay = member.is_early_bird ? 500 : 1000;

        const paymentUrl = await createPaystackTransaction(
            memberId,
            amountToPay,
            'registration'
        );

        return res.json({
            paymentUrl,
            amountToPay
        });

    } catch (error) {
        console.error("Payment URL Error:", error);
        return res.status(500).json({ error: 'Failed to generate payment link' });
    }
});

export default router;
