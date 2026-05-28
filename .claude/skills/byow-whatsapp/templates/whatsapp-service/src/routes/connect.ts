import { Router } from 'express';
import { initializeClient, getState, getQRCode } from '../whatsapp';

export const connectRoute = Router();

/**
 * POST /connect
 * Initialize WhatsApp client and return QR code
 */
connectRoute.post('/', async (req, res) => {
  try {
    const currentState = getState();

    // If already connected, return current status
    if (currentState === 'ready') {
      return res.json({
        success: true,
        status: 'ready',
        message: 'Already connected'
      });
    }

    // If already connecting/waiting for QR, return current QR
    if (currentState === 'connecting' || currentState === 'qr_ready') {
      const qr = getQRCode();
      return res.json({
        success: true,
        status: currentState,
        qrCode: qr,
        message: qr ? 'Scan QR code with WhatsApp' : 'Generating QR code...'
      });
    }

    // Start initialization (non-blocking)
    initializeClient().catch(err => {
      console.error('[Connect] Init error:', err.message);
    });

    // Return immediately - client will poll /status for QR
    res.json({
      success: true,
      status: 'connecting',
      message: 'Initializing WhatsApp client...'
    });

  } catch (error) {
    console.error('[Connect] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize WhatsApp client'
    });
  }
});
