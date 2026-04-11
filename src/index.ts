import express from 'express';
import * as dotenv from 'dotenv';
import boostRoutes from './routes/boostRoutes';
import authRoutes from './routes/authRoutes';
import memberRoutes from './routes/memberRoutes';
import testStripe from './routes/testStripe';
import stripeWebhook from './routes/stripeWebhook';
import './services/hourlyEngine';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * 1. STRIPE WEBHOOK (MUST BE FIRST)
 * We use app.post directly here to ensure express.raw is applied 
 * only to this specific endpoint.
 */
app.post(
  '/webhook/stripe',
  express.raw({ type: 'application/json' }),
  stripeWebhook
);

/**
 * 2. NORMAL MIDDLEWARE
 */
app.use(express.json());

/**
 * 3. ROUTES
 */
app.get('/', (req, res) => {
  res.send('Content Amplifier Hub API is Running!');
});

app.use('/auth', authRoutes);
app.use('/boosts', boostRoutes);
app.use('/member', memberRoutes);
app.use('/test', testStripe);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});