import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { registerNewMember } from '../services/memberService';
import { db } from '../models/db';

const router = Router();

// Configure the email sender
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// IMPROVED: Added try-catch and explicit logging for Render logs
async function generateAndSendOTP(memberId: number, email: string) {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60000); // 10 min expiry

  try {
    // 1. Clear existing and save new OTP
    await db.query('DELETE FROM otp_verifications WHERE member_id = $1', [memberId]);
    await db.query(
      'INSERT INTO otp_verifications (member_id, email, otp_code, expires_at) VALUES ($1, $2, $3, $4)',
      [memberId, email, otp, expiresAt]
    );

    // 2. Attempt to send email
    await transporter.sendMail({
      from: `"Content Amplifier Hub" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Your Verification Code",
      text: `Your verification code is: ${otp}. It expires in 10 minutes.`,
    });

    console.log(`[Mail Success] OTP sent to ${email}`);
  } catch (error: any) {
    // This will appear in your Render "Logs" tab
    console.error('[Mail Error] Detailed failure info:', {
      message: error.message,
      code: error.code,
      command: error.command
    });
    throw new Error('Failed to send verification email');
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

    await generateAndSendOTP(member.id, member.email);

    res.status(201).json({
      message: 'OTP sent to email.',
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

// POST /auth/verify-otp (UPDATED WITH AUTO-LOGIN)
router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP required' });
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

    // 1. Mark as verified
    await db.query('UPDATE members SET is_verified = true WHERE email = $1', [email]);
    await db.query('DELETE FROM otp_verifications WHERE email = $1', [email]);

    // 2. Fetch member to generate token (Auto-Login)
    const memberRes = await db.query('SELECT * FROM members WHERE email = $1', [email]);
    const member = memberRes.rows[0];

    const token = jwt.sign(
      { id: member.id, email: member.email },
      process.env.JWT_SECRET!,
      { expiresIn: '30d' }
    );

    // 3. Return token immediately
    res.json({ 
      success: true, 
      token, 
      member: {
        id: member.id,
        email: member.email,
        membership_active: member.membership_active,
        is_verified: true,
        profileComplete: member.profile_complete || false 
      }
    });
  } catch (error) {
    console.error('[Auth] Verification error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// (Keep your existing /login and /ping routes below)
export default router;