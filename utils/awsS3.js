import { S3Client } from '@aws-sdk/client-s3';
import multer from 'multer';
import multerS3 from 'multer-s3';
import path from 'path';
import crypto from 'crypto';

// Configure AWS S3 (using AWS SDK v3 for multer-s3 v3 compatibility)
const s3 = new S3Client({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  region: process.env.AWS_REGION || 'us-east-1'
});

// S3 bucket configuration
const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;
const BUCKET_REGION = process.env.AWS_REGION || 'us-east-1';

// File filter for images only
const fileFilter = (req, file, cb) => {
  // Check file type
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

// Generate unique filename
const generateFileName = (originalName) => {
  const ext = path.extname(originalName);
  const name = path.basename(originalName, ext);
  const hash = crypto.randomBytes(16).toString('hex');
  return `inventory/${Date.now()}-${hash}-${name}${ext}`;
};

// Multer configuration for S3
const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: BUCKET_NAME,
    key: function (req, file, cb) {
      const fileName = generateFileName(file.originalname);
      cb(null, fileName);
    },
    metadata: function (req, file, cb) {
      cb(null, {
        fieldName: file.fieldname,
        originalName: file.originalname,
        uploadedBy: req.user?.userId || 'unknown'
      });
    }
  }),
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 10 // Maximum 10 files per request
  }
});

// Upload single image
export const uploadSingle = upload.single('image');

// Upload multiple images
export const uploadMultiple = upload.array('images', 10);

// Upload specific number of images
export const uploadFields = upload.fields([
  { name: 'images', maxCount: 10 }
]);

// Delete image from S3
export const deleteImageFromS3 = async (imageKey) => {
  try {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: imageKey
    });
    
    await s3.send(command);
    return true;
  } catch (error) {
    console.error('Error deleting image from S3:', error);
    return false;
  }
};

// Delete multiple images from S3
export const deleteMultipleImagesFromS3 = async (imageKeys) => {
  try {
    const { DeleteObjectsCommand } = await import('@aws-sdk/client-s3');
    const command = new DeleteObjectsCommand({
      Bucket: BUCKET_NAME,
      Delete: {
        Objects: imageKeys.map(key => ({ Key: key })),
        Quiet: false
      }
    });
    
    const result = await s3.send(command);
    return result.Deleted.length === imageKeys.length;
  } catch (error) {
    console.error('Error deleting multiple images from S3:', error);
    return false;
  }
};

// Get signed URL for private access (if needed)
export const getSignedUrl = async (imageKey, expiresIn = 3600) => {
  try {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: imageKey
    });
    
    return await getSignedUrl(s3, command, { expiresIn });
  } catch (error) {
    console.error('Error generating signed URL:', error);
    return null;
  }
};

// Check if S3 is configured
export const isS3Configured = () => {
  return !!(process.env.AWS_ACCESS_KEY_ID && 
           process.env.AWS_SECRET_ACCESS_KEY && 
           process.env.AWS_S3_BUCKET_NAME);
};

// Get S3 configuration status
export const getS3Config = () => {
  return {
    isConfigured: isS3Configured(),
    bucketName: BUCKET_NAME,
    region: BUCKET_REGION,
    hasAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
    hasSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY,
    hasBucketName: !!process.env.AWS_S3_BUCKET_NAME
  };
};

// Error handler for multer
export const handleMulterError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        message: 'File too large. Maximum size is 5MB per image.',
        error: error.message
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        message: 'Too many files. Maximum 10 images per request.',
        error: error.message
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        message: 'Unexpected field name. Use "images" for multiple files or "image" for single file.',
        error: error.message
      });
    }
  }
  
  if (error.message === 'Only image files are allowed!') {
    return res.status(400).json({
      message: 'Only image files are allowed!',
      error: error.message
    });
  }
  
  next(error);
};

export default {
  uploadSingle,
  uploadMultiple,
  uploadFields,
  deleteImageFromS3,
  deleteMultipleImagesFromS3,
  getSignedUrl,
  isS3Configured,
  getS3Config,
  handleMulterError
};
