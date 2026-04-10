import express from 'express';
import * as dotenv from 'dotenv';
import boostRoutes from './routes/boostRoutes';
import authRoutes from './routes/authRoutes';
import memberRoutes from './routes/memberRoutes';
import testStripe from './routes/testStripe';
import stripeWebhook from './routes/stripeWebhook'; // NEW: Stripe webhook route
import './services/hourlyEngine';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * ---------------------------------------------------------
 * 1. STRIPE WEBHOOK — MUST USE RAW BODY
 * ---------------------------------------------------------
 * This MUST come BEFORE express.json()
 * Stripe signs the raw body, so JSON parsing would break it.
 */
app.use(
  '/webhook/stripe',
  express.raw({ type: 'application/json' }),
  stripeWebhook
);

/**
 * ---------------------------------------------------------
 * 2. NORMAL JSON BODY PARSER
 * ---------------------------------------------------------
 */
app.use(express.json());

/**
 * ---------------------------------------------------------
 * 3. ROUTES
 * ---------------------------------------------------------
 */
app.get('/', (req, res) => {
  res.send('Content Amplifier Hub API is Running!');
});

app.use('/auth', authRoutes);
app.use('/boosts', boostRoutes);
app.use('/member', memberRoutes);
app.use('/test', testStripe);

/**
 * ---------------------------------------------------------
 * 4. START SERVER
 * ---------------------------------------------------------
 */
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
