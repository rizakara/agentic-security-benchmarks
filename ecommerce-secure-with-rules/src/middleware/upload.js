import multer from "multer";
import { fileTypeFromBuffer } from "file-type";
import { v4 as uuidv4 } from "uuid";
import fs from "fs/promises";
import path from "path";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
const MAX_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 5) * 1024 * 1024;

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

const MIME_TO_EXT = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

const storage = multer.memoryStorage();

const multerUpload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
});

export const uploadSingle = multerUpload.single("image");

export async function validateAndSaveFile(req, res, next) {
  if (!req.file) return next();

  const detected = await fileTypeFromBuffer(req.file.buffer);
  if (!detected || !ALLOWED_MIME.has(detected.mime)) {
    return res.status(400).json({
      error: "Invalid file type. Allowed: JPEG, PNG, GIF, WebP",
    });
  }

  // Block SVG and HTML even if magic bytes somehow pass
  if (detected.mime === "image/svg+xml" || detected.mime === "text/html") {
    return res.status(400).json({ error: "SVG and HTML uploads are not allowed" });
  }

  const ext = MIME_TO_EXT[detected.mime];
  const filename = `${uuidv4()}${ext}`;
  const filepath = path.join(UPLOAD_DIR, filename);

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(filepath, req.file.buffer);

  req.savedFile = { filename, filepath, mime: detected.mime };
  next();
}
