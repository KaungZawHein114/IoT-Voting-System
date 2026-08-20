const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const AppError = require("../utils/appError");

const uploadDirectory = path.join(__dirname, "..", "uploads", "groups");
const publicUploadPath = "/uploads/groups";
const allowedImageTypes = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

fs.mkdirSync(uploadDirectory, { recursive: true });

const removeFile = (filePath) => {
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error(`Could not remove group image: ${filePath}`, error);
    }
  }
};

const removeUploadedFiles = (files = []) => {
  files.forEach((file) => removeFile(file.path));
};

const storage = multer.diskStorage({
  destination: (req, file, callback) => callback(null, uploadDirectory),
  filename: (req, file, callback) => {
    const extension = allowedImageTypes[file.mimetype];
    callback(null, `${crypto.randomBytes(16).toString("hex")}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 3,
  },
  fileFilter: (req, file, callback) => {
    if (!allowedImageTypes[file.mimetype]) {
      return callback(
        new AppError("Only JPEG, PNG, and WebP images are allowed", 400),
      );
    }
    callback(null, true);
  },
});

exports.uploadGroupImages = (req, res, next) => {
  upload.array("images", 3)(req, res, (error) => {
    if (error) {
      removeUploadedFiles(req.files);
      return next(error);
    }
    next();
  });
};

// Remove newly uploaded files if a later validation or database operation fails.
exports.cleanupFailedUploads = (req, res, next) => {
  res.on("finish", () => {
    if (res.statusCode >= 400) removeUploadedFiles(req.files);
  });
  next();
};

exports.getUploadedImagePaths = (files = []) =>
  files.map((file) => `${publicUploadPath}/${file.filename}`);

exports.deleteStoredImages = (imagePaths = []) => {
  imagePaths.forEach((imagePath) => {
    if (!imagePath.startsWith(`${publicUploadPath}/`)) return;
    removeFile(path.join(uploadDirectory, path.basename(imagePath)));
  });
};
