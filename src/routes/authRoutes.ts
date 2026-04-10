import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { registerNewMember } from '../services/memberService';
import { db } from '../models/db';
import { activateMembership } from '../services/paymentService'; // ONLY this stays
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// POST /auth/ping – simple health check
router.post('/ping', (req, res) => {
  console.log('Ping received');
  res.json({ message: 'pong' });
});

// POST /auth/register
router.post('/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await registerNewMember(email, hashedPassword);
    const member = result.member;
    const amount = result.amountToPay;

    // Stripe-only flow: no Paystack transaction here
    res.status(201).json({
      member: {
        id: member.id,
        email: member.email,
        membership_active: member.membership_active,
        profile_complete: member.profile_photo_url ? true : false,
        payment_complete: member.membership_active,
      },
      amountToPay: amount,
      paymentRequired: true
    });

  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const result = await db.query('SELECT * FROM members WHERE email = $1', [email]);
    const member = result.rows[0];
    if (!member) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, member.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: member.id, email: member.email },
      process.env.JWT_SECRET!,
      { expiresIn: '30d' }
    );

    res.json({
      token,
      member: {
        id: member.id,
        email: member.email,
        membership_active: member.membership_active,
        profile_complete: member.profile_photo_url ? true : false,
        payment_complete: member.membership_active,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
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
