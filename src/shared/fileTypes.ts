export type VaultFileKind = 'image' | 'video' | 'document' | 'file';

const EXTENSION_MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.log': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.toml': 'text/toml',
  '.ini': 'text/plain',
  '.conf': 'text/plain',
  '.cfg': 'text/plain',
  '.env': 'text/plain',
  '.rtf': 'application/rtf',
  '.csv': 'text/csv',
  '.tsv': 'text/tab-separated-values',
  '.sql': 'application/sql',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.epub': 'application/epub+zip',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
  '.odp': 'application/vnd.oasis.opendocument.presentation',
  '.ott': 'application/vnd.oasis.opendocument.text-template',
  '.ots': 'application/vnd.oasis.opendocument.spreadsheet-template',
  '.otp': 'application/vnd.oasis.opendocument.presentation-template',
  '.otd': 'application/vnd.oasis.opendocument.text',
};

const extensionOf = (filename: string): string => {
  const basename = filename.split(/[\\/]/).pop() ?? filename;
  const dot = basename.lastIndexOf('.');
  return dot > -1 ? basename.slice(dot).toLowerCase() : '';
};

export const getMimeTypeForFilename = (filename: string): string => {
  return EXTENSION_MIME_TYPES[extensionOf(filename)] ?? 'application/octet-stream';
};

export const isImageMimeType = (mimeType: string): boolean => mimeType.startsWith('image/');

export const isVideoMimeType = (mimeType: string): boolean => mimeType.startsWith('video/');

export const isMediaMimeType = (mimeType: string): boolean =>
  isImageMimeType(mimeType) || isVideoMimeType(mimeType);

export const isPdfMimeType = (mimeType: string): boolean => mimeType === 'application/pdf';

export const isTextDocumentMimeType = (mimeType: string): boolean =>
  mimeType === 'text/plain' ||
  mimeType === 'text/markdown' ||
  mimeType === 'text/yaml' ||
  mimeType === 'text/toml' ||
  mimeType === 'text/csv' ||
  mimeType === 'text/tab-separated-values' ||
  mimeType === 'text/html' ||
  mimeType === 'application/sql' ||
  mimeType === 'application/json' ||
  mimeType === 'application/xml' ||
  mimeType === 'image/svg+xml';

export const isDocxMimeType = (mimeType: string): boolean =>
  mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const isReadableDocumentMimeType = (mimeType: string): boolean =>
  isTextDocumentMimeType(mimeType) || isDocxMimeType(mimeType);

export const isPreviewableMimeType = (mimeType: string): boolean =>
  isMediaMimeType(mimeType) || isPdfMimeType(mimeType) || isReadableDocumentMimeType(mimeType);

export const isDocumentMimeType = (mimeType: string): boolean =>
  !isMediaMimeType(mimeType);

export const getVaultFileKind = (mimeType: string): VaultFileKind => {
  if (isImageMimeType(mimeType)) return 'image';
  if (isVideoMimeType(mimeType)) return 'video';
  return 'document';
};
