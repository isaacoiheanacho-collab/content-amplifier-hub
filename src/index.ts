import express from 'express';
import * as dotenv from 'dotenv';
import boostRoutes from './routes/boostRoutes';
import authRoutes from './routes/authRoutes';
import memberRoutes from './routes/memberRoutes';
import './services/hourlyEngine';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Capture raw body for Paystack webhook
app.use('/auth/paystack-webhook', (req, res, next) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
        (req as any).rawBody = data;
        next();
    });
});

app.use(express.json());

app.get('/', (req, res) => {
    res.send('Content Amplifier Hub API is Running!');
});

app.use('/auth', authRoutes);
app.use('/boosts', boostRoutes);
app.use('/member', memberRoutes);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});