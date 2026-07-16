/**
 * QR code generation route - generates QR code images server-side
 * to avoid external API dependency that breaks in addon/ingress environments.
 */

import { Router } from 'express';
import QRCode from 'qrcode';

const router = Router();

/**
 * GET /api/qr?data=...&size=120
 * Returns a QR code PNG image for the given data string.
 */
router.get('/api/qr', async (req, res) => {
  const data = req.query.data;
  if (typeof data !== 'string' || data.length === 0) {
    res.status(400).json({ error: 'Missing or invalid "data" query parameter' });
    return;
  }

  // Limit data length to prevent abuse
  if (data.length > 2048) {
    res.status(400).json({ error: 'Data too long (max 2048 characters)' });
    return;
  }

  const sizeParam = req.query.size;
  const size =
    typeof sizeParam === 'string' && /^\d+$/.test(sizeParam)
      ? Math.min(Math.max(Number(sizeParam), 50), 500)
      : 120;

  try {
    const buffer = await QRCode.toBuffer(data, {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
      type: 'png',
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

export function createQrRoutes(): Router {
  return router;
}
