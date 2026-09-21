// 04_upload_controller.js - Multer Image Upload & S3 Buffer Handling

// Mock Services & Database
export const S3Service = {
  upload: async ({ buffer, originalname, mimetype, key }) => ({
    Location: `https://mock-s3-bucket.s3.amazonaws.com/${key}`,
    Key: key,
    Bucket: 'mock-s3-bucket'
  }),
  delete: async (key) => ({
    DeleteMarker: true,
    VersionId: 'mock-version-id'
  })
};

export const FileRecord = {
  create: async (data) => ({ id: 'file_rec_123', ...data, createdAt: new Date() }),
  findById: async (id) => null,
  delete: async (id) => true
};

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export const uploadImage = async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded. Form field "image" is required.'
      });
    }

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return res.status(415).json({
        success: false,
        error: `Unsupported media type: ${file.mimetype}. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`
      });
    }

    if (file.size > MAX_FILE_SIZE) {
      return res.status(413).json({
        success: false,
        error: `File exceeds maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)}MB`
      });
    }

    const fileExtension = file.originalname.split('.').pop();
    const sanitizedBase = file.originalname.replace(/[^a-zA-Z0-9_-]/g, '_');
    const s3Key = `uploads/${Date.now()}-${sanitizedBase}.${fileExtension}`;

    const s3Result = await S3Service.upload({
      buffer: file.buffer,
      originalname: file.originalname,
      mimetype: file.mimetype,
      key: s3Key
    });

    const record = await FileRecord.create({
      originalName: file.originalname,
      s3Key: s3Result.Key,
      url: s3Result.Location,
      size: file.size,
      mimetype: file.mimetype,
      uploadedBy: req.user?.id || 'anonymous'
    });

    return res.status(201).json({
      success: true,
      message: 'Image uploaded successfully',
      data: {
        fileId: record.id,
        url: record.url,
        size: record.size,
        mimetype: record.mimetype
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to upload image',
      details: error.message
    });
  }
};

export const deleteImage = async (req, res) => {
  try {
    const { fileId } = req.params || {};

    if (!fileId) {
      return res.status(400).json({
        success: false,
        error: 'File ID parameter is required'
      });
    }

    const file = await FileRecord.findById(fileId);
    if (!file) {
      return res.status(404).json({
        success: false,
        error: `File with ID ${fileId} not found`
      });
    }

    await S3Service.delete(file.s3Key);
    await FileRecord.delete(fileId);

    return res.status(200).json({
      success: true,
      message: 'File deleted successfully',
      data: { fileId }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to delete file',
      details: error.message
    });
  }
};
