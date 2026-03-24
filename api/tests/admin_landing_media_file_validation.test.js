import { describe, expect, it } from 'vitest';
import { getLandingMediaMimeType, isAllowedLandingMediaFile } from '../routes/admin_landing_media.js';

describe('admin landing media file validation', () => {
  it('accepts mp4 and mov with explicit video mime types', () => {
    expect(isAllowedLandingMediaFile({ originalname: 'demo.mp4', mimetype: 'video/mp4' })).toBe(true);
    expect(isAllowedLandingMediaFile({ originalname: 'intro.mov', mimetype: 'video/quicktime' })).toBe(true);
  });

  it('accepts mov/mp4 when client sends generic octet-stream mime', () => {
    expect(isAllowedLandingMediaFile({ originalname: 'demo.mp4', mimetype: 'application/octet-stream' })).toBe(true);
    expect(isAllowedLandingMediaFile({ originalname: 'intro.MOV', mimetype: 'application/octet-stream' })).toBe(true);
  });

  it('rejects unsupported combinations', () => {
    expect(isAllowedLandingMediaFile({ originalname: 'notes.txt', mimetype: 'application/octet-stream' })).toBe(false);
    expect(isAllowedLandingMediaFile({ originalname: 'fake.mov', mimetype: 'text/plain' })).toBe(false);
  });

  it('resolves mime type by file extension', () => {
    expect(getLandingMediaMimeType('clip.mp4')).toBe('video/mp4');
    expect(getLandingMediaMimeType('clip.MOV')).toBe('video/quicktime');
    expect(getLandingMediaMimeType('unknown.bin')).toBe('application/octet-stream');
  });
});
