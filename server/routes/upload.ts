import { Router } from "express";
import multer from "multer";
import path from "path";
import { uploadImageBuffer } from "../lib/cloudinary";

export const uploadRouter = Router();

const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extOk = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimeOk = allowedTypes.test(file.mimetype);
    if (extOk && mimeOk) {
      cb(null, true);
      return;
    }
    cb(new Error("Only image files (jpeg, png, webp) are allowed"));
  },
}).single("image");

uploadRouter.post("/receipt", (req, res) => {
  uploadImage(req, res, async (err) => {
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "No image file uploaded" });
      return;
    }
    try {
      const { secureUrl } = await uploadImageBuffer(req.file.buffer, "csi-wf/receipts");
      res.json({ url: secureUrl });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : "Upload failed" });
    }
  });
});
