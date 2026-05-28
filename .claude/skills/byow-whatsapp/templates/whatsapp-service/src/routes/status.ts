import { Router } from 'express';
import { getState, getQRCode, getClientInfo } from '../whatsapp';

export const statusRoute = Router();

/**
 * GET /status
 * Get current connection status and QR code if available
 */
statusRoute.get('/', async (req, res) => {
  try {
    const state = getState();
    const qrCode = getQRCode();
    const clientInfo = getClientInfo();

    res.json({
      success: true,
      status: state,
      qrCode: qrCode,
      clientInfo: clientInfo,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Status] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get status'
    });
  }
});
