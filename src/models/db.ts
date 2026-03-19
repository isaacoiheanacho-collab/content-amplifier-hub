import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// This is the central connection to your Render database
export const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // This is required for Render cloud connections
    }
});