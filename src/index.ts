import express from 'express';
import * as dotenv from 'dotenv';
import boostRoutes from './routes/boostRoutes';
import authRoutes from './routes/authRoutes';
import './services/hourlyEngine';   // <-- ADD THIS

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req, res) => {
    res.send('Content Amplifier Hub API is Running!');
});

app.use('/auth', authRoutes);
app.use('/boosts', boostRoutes);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});