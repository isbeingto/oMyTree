import { NextRequest, NextResponse } from 'next/server';
import { readdir, unlink, stat } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

/**
 * 文件垃圾回收 API
 * 检查uploads目录中的所有文件，如果超过24小时未被使用，则删除
 * 
 * 调用时机：
 * 1. 文档保存时调用，传入currentContent来排除已使用的文件
 * 2. 定期清理任务（可通过cron job调用）
 */

interface CleanupRequest {
  currentContent?: string; // 当前文档内容，用于检查哪些文件仍在使用
  maxAgeHours?: number; // 文件最大保留时间（小时），默认24
  dryRun?: boolean; // 是否为测试运行（不实际删除）
}

export async function POST(request: NextRequest) {
  try {
    const body: CleanupRequest = await request.json();
    const {
      currentContent = '',
      maxAgeHours = 24,
      dryRun = false,
    } = body;

    const uploadDir = join(process.cwd(), 'public', 'uploads');
    if (!existsSync(uploadDir)) {
      return NextResponse.json({
        success: true,
        message: 'Upload directory does not exist',
        cleaned: 0,
        freed: 0,
      });
    }

    // Parse URLs from content (both markdown and HTML tags)
    const usedFiles = new Set<string>();
    
    // Match markdown images: ![alt](url)
    const mdImageRegex = /!\[.*?\]\((\/uploads\/[^)]+)\)/g;
    // Match HTML img tags: <img src="url">
    const htmlImgRegex = /<img[^>]+src=["'](\/uploads\/[^"']+)["']/g;
    // Match HTML video tags: <video>...<source src="url">
    const videoRegex = /<source[^>]+src=["'](\/uploads\/[^"']+)["']/g;
    
    let match;
    while ((match = mdImageRegex.exec(currentContent)) !== null) {
      usedFiles.add(match[1]);
    }
    while ((match = htmlImgRegex.exec(currentContent)) !== null) {
      usedFiles.add(match[1]);
    }
    while ((match = videoRegex.exec(currentContent)) !== null) {
      usedFiles.add(match[1]);
    }

    let cleanedCount = 0;
    let freedBytes = 0;
    const cleanedFiles: string[] = [];
    const skippedFiles: string[] = [];

    // Check both image and video directories
    for (const type of ['image', 'video']) {
      const typeDir = join(uploadDir, type);
      if (!existsSync(typeDir)) continue;

      const files = await readdir(typeDir);

      for (const filename of files) {
        const filepath = join(typeDir, filename);
        const publicUrl = `/uploads/${type}/${filename}`;
        
        // Skip files that are used in current content
        if (usedFiles.has(publicUrl)) {
          skippedFiles.push(publicUrl);
          continue;
        }

        // Check file age
        const stats = await stat(filepath);
        const ageMs = Date.now() - stats.mtimeMs;
        const ageHours = ageMs / (1000 * 60 * 60);

        if (ageHours > maxAgeHours) {
          try {
            if (!dryRun) {
              await unlink(filepath);
            }
            cleanedCount++;
            freedBytes += stats.size;
            cleanedFiles.push(publicUrl);
            console.log(`[FileCleanup] Deleted: ${publicUrl} (age: ${ageHours.toFixed(1)}h, size: ${stats.size} bytes)`);
          } catch (error) {
            console.error(`[FileCleanup] Failed to delete ${filepath}:`, error);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      dryRun,
      cleaned: cleanedCount,
      freed: freedBytes,
      freedMB: (freedBytes / 1024 / 1024).toFixed(2),
      cleanedFiles,
      usedFiles: Array.from(usedFiles),
      skippedFiles,
      message: dryRun
        ? `[DRY RUN] Would clean ${cleanedCount} files and free ${(freedBytes / 1024 / 1024).toFixed(2)}MB`
        : `Cleaned ${cleanedCount} files and freed ${(freedBytes / 1024 / 1024).toFixed(2)}MB`,
    });
  } catch (error) {
    console.error('[FileCleanup API] Error:', error);
    return NextResponse.json(
      { 
        error: 'Cleanup failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  return NextResponse.json({}, { status: 200 });
}
