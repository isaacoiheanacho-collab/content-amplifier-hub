import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { registerNewMember } from '../services/memberService';
import { db } from '../models/db';
import { createPaystackTransaction, verifyPaystackTransaction, activateMembership } from '../services/paymentService';
import { authenticate, AuthRequest } from '../middleware/auth'; // <-- ADD THIS

const router = Router();

// POST /auth/register
router.post('/register', async (req, res) => {
  // ... (unchanged)
});

// GET /auth/payment/callback
router.get('/payment/callback', async (req, res) => {
  // ... (unchanged)
});

// POST /auth/paystack-webhook
router.post('/paystack-webhook', async (req, res) => {
  // ... (unchanged)
});

// POST /auth/login
router.post('/login', async (req, res) => {
  // ... (unchanged)
});

// POST /auth/register-token
router.post('/register-token', authenticate, async (req: AuthRequest, res) => {
    const { fcmToken } = req.body;
    const memberId = req.user.id;
    if (!fcmToken) {
        return res.status(400).json({ error: 'Token required' });
    }
    await db.query('UPDATE members SET fcm_token = $1 WHERE id = $2', [fcmToken, memberId]);
    res.json({ success: true });
});

export default router;