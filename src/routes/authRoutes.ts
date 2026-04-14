import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Resend } from 'resend';
import { registerNewMember } from '../services/memberService';
import { db } from '../models/db';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// Initialize Resend with your API key
const resend = new Resend(process.env.RESEND_API_KEY);

// Helper: Generate, Save to DB, and Send OTP via Resend
async function generateAndSendOTP(memberId: number, email: string) {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60000); // 10 min expiry

  // Clear any existing OTPs for this member
  await db.query('DELETE FROM otp_verifications WHERE member_id = $1', [memberId]);

  // Save the fresh OTP to the database
  await db.query(
    'INSERT INTO otp_verifications (member_id, email, otp_code, expires_at) VALUES ($1, $2, $3, $4)',
    [memberId, email, otp, expiresAt]
  );

  // Send email via Resend
  try {
    const { data, error } = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: [email],
      subject: 'Your Verification Code',
      html: `<p>Your verification code is: <strong>${otp}</strong></p>
             <p>It expires in 10 minutes.</p>`,
    });

    if (error) {
      console.error('[Resend] Failed to send email:', error);
    } else {
      console.log('[Resend] Email sent successfully:', data);
    }
  } catch (err) {
    console.error('[Resend] Exception:', err);
  }
}

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

    // Send OTP (fire and forget)
    generateAndSendOTP(member.id, member.email).catch(err =>
      console.error('[OTP Error] Background send failed:', err)
    );

    res.status(201).json({
      message: 'Registration successful. Verification code sent to email.',
      memberId: member.id,
      email: member.email,
      isVerified: false
    });
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    console.error('[Auth] Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /auth/verify-otp (unchanged)
router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP are required' });
  }

  try {
    const result = await db.query(
      `SELECT * FROM otp_verifications 
       WHERE email = $1 AND otp_code = $2 AND expires_at > NOW()`,
      [email, otp]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }

    const memberResult = await db.query(
      'UPDATE members SET is_verified = true WHERE email = $1 RETURNING *',
      [email]
    );
    const member = memberResult.rows[0];

    await db.query('DELETE FROM otp_verifications WHERE email = $1', [email]);

    const token = jwt.sign(
      { id: member.id, email: member.email },
      process.env.JWT_SECRET!,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      message: 'Email verified successfully!',
      token,
      member: {
        id: member.id,
        email: member.email,
        membership_active: member.membership_active,
        is_verified: member.is_verified,
        profile_complete: member.profile_complete || false,
        full_name: member.full_name,
        region: member.region,
        country: member.country,
        state_region: member.state_region
      }
    });
  } catch (error) {
    console.error('[Auth] Verification error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// POST /auth/login (unchanged except Resend for resending OTP)
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

    if (!member.is_verified) {
      generateAndSendOTP(member.id, member.email).catch(err =>
        console.error('[Email Error] Background resend failed:', err)
      );

      return res.status(403).json({
        error: 'Email not verified',
        needsVerification: true,
        isVerified: false,
        email: member.email,
        memberId: member.id
      });
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
        is_verified: member.is_verified,
        profile_complete: member.profile_complete || false,
        full_name: member.full_name,
        region: member.region,
        country: member.country,
        state_region: member.state_region
      },
    });
  } catch (error) {
    console.error('[Auth] Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/ping', (req, res) => {
  res.json({ message: 'pong' });
});

export default router;