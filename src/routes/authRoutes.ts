import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { registerNewMember } from '../services/memberService';
import { db } from '../models/db';
import { createPaystackTransaction, verifyPaystackTransaction, activateMembership } from '../services/paymentService';
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

    // Create Paystack transaction
    let paymentUrl = null;
    try {
      paymentUrl = await createPaystackTransaction(member.id, amount, 'registration');
    } catch (payError) {
      console.error('Paystack init error:', payError);
      res.status(201).json({
        member: {
          id: member.id,
          email: member.email,
          membership_active: member.membership_active,
          profile_complete: member.profile_photo_url ? true : false,
          payment_complete: member.membership_active, // mirrors membership_active for now
        },
        amountToPay: amount,
        paymentRequired: true,
        error: 'Payment gateway temporarily unavailable. Please try again later.',
      });
      return;
    }

    res.status(201).json({
      member: {
        id: member.id,
        email: member.email,
        membership_active: member.membership_active,
        profile_complete: member.profile_photo_url ? true : false,
        payment_complete: member.membership_active, // true only after webhook activates membership
      },
      amountToPay: amount,
      paymentUrl,
    });
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /auth/payment/callback
router.get('/payment/callback', async (req, res) => {
  const { reference } = req.query;
  if (!reference) {
    return res.status(400).send('Missing transaction reference');
  }
  try {
    const verification = await verifyPaystackTransaction(reference as string);
    if (verification.success) {
      res.send('Payment successful! Your membership is now active.');
    } else {
      res.status(400).send('Payment verification failed.');
    }
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal error');
  }
});

// POST /auth/paystack-webhook
router.post('/paystack-webhook', async (req, res) => {
  const rawBody = (req as any).rawBody;
  if (!rawBody) {
    console.error('No raw body for webhook');
    return res.status(400).send('Bad request');
  }

  // Verify signature
  const hash = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY!)
    .update(rawBody)
    .digest('hex');

  if (hash !== req.headers['x-paystack-signature']) {
    console.warn('Invalid Paystack signature');
    return res.status(401).send('Invalid signature');
  }

  // Parse the raw body
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (err) {
    console.error('Invalid JSON in webhook payload');
    return res.status(400).send('Invalid payload');
  }

  // Process the event
  if (event.event === 'charge.success') {
    const data = event.data;
    const reference = data.reference;
    const amount = data.amount / 100; // convert kobo to naira
    const metadata = data.metadata;
    const memberId = metadata.memberId;
    const type = metadata.type; // 'registration' or 'maintenance'

    try {
      await activateMembership(memberId, amount, type, reference);
      console.log(`Membership activated for member ${memberId}`);
    } catch (err) {
      console.error('Failed to activate membership:', err);
      // Still return 200 to Paystack so they don't retry
    }
  }

  // Acknowledge receipt
  res.sendStatus(200);
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
        payment_complete: member.membership_active, // same logic as above
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
