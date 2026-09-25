import { Request, Response } from "express";

/**
 * @swagger
 * /upload:
 *   post:
 *     summary: Upload a file (e.g. KYC ID document)
 *     description: |
 *       Returns an opaque `fileId` — NOT a public URL. Files are stored
 *       privately and served only through the authenticated KYC document
 *       endpoint. Pass the returned `fileId` as `idImage` when submitting KYC.
 *     tags: [KYC]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Uploaded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     fileId: { type: string }
 *                     originalName: { type: string }
 *                     size: { type: integer }
 *                     mimeType: { type: string }
 *       400:
 *         $ref: '#/components/schemas/ErrorEnvelope'
 */
export class FileUploadController {
  async uploadFile(req: Request, res: Response): Promise<any> {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: { code: "NO_FILE", message: "No file uploaded" },
      });
    }

    // Return an opaque reference, NOT a public URL. Files are stored privately
    // and only served through the authenticated KYC document endpoint.
    return res.status(201).json({
      success: true,
      data: {
        fileId: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype,
      },
    });
  }
}