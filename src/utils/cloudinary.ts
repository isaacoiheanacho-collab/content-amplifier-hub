import { v2 as cloudinary } from 'cloudinary';
import * as dotenv from 'dotenv';

// Load variables from .env into process.env
dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true // Good practice to use HTTPS
});

export default cloudinary;