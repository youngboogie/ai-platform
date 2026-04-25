const ASCII_FILE_NAME_REGEX = /^[\x00-\x7F]*$/;
const CJK_CHAR_REGEX = /[\u3400-\u9fff]/g;

const countCjkChars = (value: string) => (value.match(CJK_CHAR_REGEX) || []).length;

const decodeLatin1AsUtf8 = (value: string) => {
  try {
    return Buffer.from(value, 'latin1').toString('utf8');
  } catch {
    return value;
  }
};

const sanitizeFileName = (value: string) =>
  value
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();

export const normalizeUploadedFileName = (originalName: string) => {
  const safeOriginal = sanitizeFileName(originalName || '');
  if (!safeOriginal) {
    return 'untitled';
  }

  // ASCII file names are stable and do not need transcoding.
  if (ASCII_FILE_NAME_REGEX.test(safeOriginal)) {
    return safeOriginal;
  }

  const decoded = sanitizeFileName(decodeLatin1AsUtf8(safeOriginal));
  if (!decoded) {
    return safeOriginal;
  }

  // Use the version that contains more CJK chars to avoid damaging already-correct names.
  return countCjkChars(decoded) > countCjkChars(safeOriginal)
    ? decoded
    : safeOriginal;
};
