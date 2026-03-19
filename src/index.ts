import express from 'express';
import * as dotenv from 'dotenv';
import boostRoutes from './routes/boostRoutes';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON data
app.use(express.json());

// Basic Health Check (To see if the site is up)
app.get('/', (req, res) => {
    res.send('Kaka Amplifier API is Running!');
});

// Activate your Boost Routes
app.use('/boosts', boostRoutes);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});