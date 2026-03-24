import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

// Allowed file types with size limits (in bytes)
const ALLOWED_TYPES: Record<string, Record<string, { ext: string; maxSize: number }>> = {
  image: {
    'image/jpeg': { ext: 'jpg', maxSize: 5 * 1024 * 1024 }, // 5MB
    'image/png': { ext: 'png', maxSize: 5 * 1024 * 1024 },
    'image/gif': { ext: 'gif', maxSize: 10 * 1024 * 1024 }, // 10MB for GIF
    'image/webp': { ext: 'webp', maxSize: 5 * 1024 * 1024 },
    'image/svg+xml': { ext: 'svg', maxSize: 2 * 1024 * 1024 },
  },
  video: {
    'video/mp4': { ext: 'mp4', maxSize: 100 * 1024 * 1024 }, // 100MB
    'video/webm': { ext: 'webm', maxSize: 100 * 1024 * 1024 },
    'video/quicktime': { ext: 'mov', maxSize: 100 * 1024 * 1024 },
  },
};

export async function POST(request: NextRequest) {
  try {
    // Check authentication (you may want to verify session here)
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const type = formData.get('type') as string || 'image';

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedMimes = type === 'video' 
      ? ALLOWED_TYPES.video 
      : ALLOWED_TYPES.image;
    
    const mimeConfig = allowedMimes[file.type];
    if (!mimeConfig) {
      return NextResponse.json(
        { 
          error: `Unsupported file type: ${file.type}. Allowed: ${Object.keys(allowedMimes).join(', ')}` 
        },
        { status: 400 }
      );
    }

    // Check file size
    if (file.size > mimeConfig.maxSize) {
      return NextResponse.json(
        { 
          error: `File too large. Max size: ${mimeConfig.maxSize / 1024 / 1024}MB` 
        },
        { status: 400 }
      );
    }

    // Create upload directory if it doesn't exist
    const uploadDir = join(process.cwd(), 'public', 'uploads', type);
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const filename = `${timestamp}-${random}.${mimeConfig.ext}`;
    const filepath = join(uploadDir, filename);

    // Save file
    const buffer = await file.arrayBuffer();
    await writeFile(filepath, Buffer.from(buffer));

    // Return public URL with metadata for tracking
    const publicUrl = `/uploads/${type}/${filename}`;

    return NextResponse.json({
      success: true,
      url: publicUrl,
      filename,
      size: file.size,
      type: file.type,
      // Include creation timestamp for cleanup tracking
      uploadedAt: timestamp,
    });
  } catch (error) {
    console.error('[Upload API] Error:', error);
    return NextResponse.json(
      { error: 'Upload failed' },
      { status: 500 }
    );
  }
}

// Handle OPTIONS for CORS
export async function OPTIONS(request: NextRequest) {
  return NextResponse.json({}, { status: 200 });
}
