import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { registerNewMember } from '../services/memberService';
import { db } from '../models/db';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// Configure the email sender using your Gmail App Password from Render env
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Helper: Generate, Save to DB, and Send OTP via Email
async function generateAndSendOTP(memberId: number, email: string) {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60000); // 10 min expiry

  // Clear any existing OTPs for this member to prevent confusion
  await db.query('DELETE FROM otp_verifications WHERE member_id = $1', [memberId]);

  // Save the fresh OTP to your new separate table
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

    // Send the verification code immediately after DB insertion
    await generateAndSendOTP(member.id, member.email);

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

    // 1. Mark member as verified in the members table
    await db.query('UPDATE members SET is_verified = true WHERE email = $1', [email]);
    
    // 2. Clean up: Delete the used OTP record
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

    // --- CORRECTION: BLOCK TOKEN GENERATION IF NOT VERIFIED ---
    if (!member.is_verified) {
      // Automatically resend OTP so the user has a fresh code to use
      await generateAndSendOTP(member.id, member.email);

      return res.status(403).json({ 
        error: 'Email not verified', 
        isVerified: false,
        email: member.email, // Passing email for the Frontend navigation
        memberId: member.id 
      });
    }

    // Only issue token if verification is passed
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
        // Ensure profile_complete is returned so Flutter knows which screen to show
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