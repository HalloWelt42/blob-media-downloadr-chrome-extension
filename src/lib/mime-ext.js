// SPDX-License-Identifier: LicenseRef-BlobMediaDownloadr-NC-2.0
// Copyright (c) 2026 HalloWelt42
//
// MIME-Type -> Datei-Endung und Kategorie-Mapping.
// Keine Remote-Dienste, nur statische Tabellen.

export const MIME_TO_EXT = {
  // Audio
  'audio/ogg': 'ogg',
  'audio/oga': 'ogg',
  'audio/opus': 'opus',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/wave': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'webm',
  'audio/aac': 'aac',
  'audio/flac': 'flac',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/3gpp': '3gp',

  // Video
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/ogg': 'ogv',
  'video/quicktime': 'mov',
  'video/x-matroska': 'mkv',
  'video/x-msvideo': 'avi',
  'video/mpeg': 'mpg',
  'video/3gpp': '3gp',

  // Image
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/tiff': 'tiff',
  'image/x-icon': 'ico',
  'image/heic': 'heic',

  // Document
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
  'application/x-7z-compressed': '7z',
  'application/x-rar-compressed': 'rar',
  'application/json': 'json',
  'application/xml': 'xml',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    'pptx',
  'text/plain': 'txt',
  'text/html': 'html',
  'text/css': 'css',
  'text/csv': 'csv',
  'text/xml': 'xml',
  'text/javascript': 'js',
  'application/javascript': 'js',
  'application/octet-stream': 'bin'
};

/** Wildcard-Fallbacks, falls ein MIME-Type nicht exakt bekannt ist */
const WILDCARD_EXT = {
  audio: 'audio',
  video: 'video',
  image: 'img',
  text: 'txt',
  application: 'bin'
};

/** Kategorien für Filter-Pills */
export const CATEGORIES = {
  audio: 'audio',
  video: 'video',
  image: 'image',
  document: 'document',
  other: 'other'
};

/**
 * Liefert die Datei-Endung für einen MIME-Type.
 * @param {string} mime
 * @returns {string}
 */
export function extForMime(mime) {
  if (!mime || typeof mime !== 'string') return 'bin';
  const lower = mime.toLowerCase().split(';')[0].trim();
  if (MIME_TO_EXT[lower]) return MIME_TO_EXT[lower];
  const top = lower.split('/')[0];
  return WILDCARD_EXT[top] || 'bin';
}

/**
 * Klassifiziert einen MIME-Type in eine der Filter-Kategorien.
 * @param {string} mime
 * @returns {'audio'|'video'|'image'|'document'|'other'}
 */
export function categoryForMime(mime) {
  if (!mime || typeof mime !== 'string') return 'other';
  const lower = mime.toLowerCase().split(';')[0].trim();
  if (lower.startsWith('audio/')) return 'audio';
  if (lower.startsWith('video/')) return 'video';
  if (lower.startsWith('image/')) return 'image';
  if (
    lower.startsWith('text/') ||
    lower.startsWith('application/pdf') ||
    lower.startsWith('application/json') ||
    lower.startsWith('application/xml') ||
    lower.startsWith('application/zip') ||
    lower.startsWith('application/x-') ||
    lower.startsWith('application/msword') ||
    lower.startsWith('application/vnd.ms-') ||
    lower.startsWith('application/vnd.openxmlformats-')
  ) {
    return 'document';
  }
  return 'other';
}

/**
 * Magic-Byte-Erkennung für Fälle, in denen der MIME-Type leer ist.
 * Akzeptiert die ersten ~16 Bytes als Uint8Array.
 * @param {Uint8Array} bytes
 * @returns {string} erkannter MIME-Type oder '' (unbekannt)
 */
export function sniffMagicBytes(bytes) {
  if (!bytes || !bytes.length) return '';
  const b = bytes;
  // JPEG
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  // PNG
  if (
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a
  ) {
    return 'image/png';
  }
  // GIF87a / GIF89a
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) {
    return 'image/gif';
  }
  // WebP: RIFF....WEBP
  if (
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  ) {
    return 'image/webp';
  }
  // PDF: %PDF
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) {
    return 'application/pdf';
  }
  // OGG: OggS
  if (b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53) {
    return 'audio/ogg';
  }
  // MP4 ftyp (offset 4)
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    return 'video/mp4';
  }
  // Matroska/WebM EBML
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) {
    return 'video/webm';
  }
  // ZIP: PK\x03\x04
  if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) {
    return 'application/zip';
  }
  // WAV: RIFF....WAVE
  if (
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x41 &&
    b[10] === 0x56 &&
    b[11] === 0x45
  ) {
    return 'audio/wav';
  }
  // ID3 tag (MP3)
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) return 'audio/mpeg';
  // MP3 frame sync
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return 'audio/mpeg';
  return '';
}
