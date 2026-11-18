import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config.js';

// Cloudinary credentials come from the environment (see README). Without them photo uploads are switched off.
if (config.cloudinary.configured) {
  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
    secure: true,
  });
}

// Kept in one object so tests can swap it for a fake instead of calling the real service.
export const photoStore = {
  enabled: () => config.cloudinary.configured,

  // Stores the image as a 512x512 square centred on the face, one file per user (re-uploading replaces it).
  upload(buffer, userId) {
    return new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder: 'placeme/avatars',
            public_id: `user_${userId}`,
            overwrite: true,
            invalidate: true,
            resource_type: 'image',
            allowed_formats: ['jpg', 'png', 'webp'],
            transformation: [{ width: 512, height: 512, crop: 'fill', gravity: 'face', quality: 'auto', fetch_format: 'auto' }],
          },
          (err, result) => (err ? reject(err) : resolve({ url: result.secure_url, publicId: result.public_id })),
        )
        .end(buffer);
    });
  },

  async remove(publicId) {
    if (!publicId) return;
    await cloudinary.uploader.destroy(publicId, { invalidate: true });
  },
};
