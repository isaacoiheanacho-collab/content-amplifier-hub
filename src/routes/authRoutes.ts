import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { registerNewMember } from '../services/memberService';
import { db } from '../models/db';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// 1. Updated Transporter with explicit host and security settings
const transporter = nodemailer.createTransport({
  service: 'gmail',
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, // Use SSL for port 465
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // Your 16-character app password: tnlkezctuogmmdbi
  },
  connectionTimeout: 10000, // 10 seconds timeout for the SMTP handshake
});

// Helper: Generate, Save to DB, and Send OTP via Email
async function generateAndSendOTP(memberId: number, email: string) {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60000); // 10 min expiry

  // Clear any existing OTPs for this member to prevent confusion
  await db.query('DELETE FROM otp_verifications WHERE member_id = $1', [memberId]);

  // Save the fresh OTP to the database
  await db.query(
    'INSERT INTO otp_verifications (member_id, email, otp_code, expires_at) VALUES ($1, $2, $3, $4)',
    [memberId, email, otp, expiresAt]
  );

  // Trigger the email
  await transporter.sendMail({
    from: `"Content Amplifier Hub" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Your Verification Code",
    text: `Your verification code is: ${otp}. It expires in 10 minutes.`,
  });
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

    // Send code: Fire and forget (don't await) to respond to client immediately
    generateAndSendOTP(member.id, member.email).catch(err => 
      console.error('[Email Error] Background send failed:', err)
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

// POST /auth/verify-otp
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

    // 1. Mark member as verified
    await db.query('UPDATE members SET is_verified = true WHERE email = $1', [email]);
    
    // 2. Clean up
    await db.query('DELETE FROM otp_verifications WHERE email = $1', [email]);

    res.json({ success: true, message: 'Email verified successfully!' });
  } catch (error) {
    console.error('[Auth] Verification error:', error);
    res.status(500).json({ error: 'Verification failed' });
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

    // BLOCK LOGIN IF NOT VERIFIED
    if (!member.is_verified) {
      // Fire and forget: Respond to Flutter immediately while email sends in background
      generateAndSendOTP(member.id, member.email).catch(err => 
        console.error('[Email Error] Background resend failed:', err)
      );

      return res.status(403).json({ 
        error: 'Email not verified', 
        needsVerification: true, // Used by AuthService.dart logic
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
        profile_complete: member.profile_complete || false 
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