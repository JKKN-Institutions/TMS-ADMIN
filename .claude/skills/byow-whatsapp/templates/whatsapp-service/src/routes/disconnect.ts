import { Router } from 'express';
import { disconnect, getState } from '../whatsapp';

export const disconnectRoute = Router();

/**
 * POST /disconnect
 * Disconnect and logout from WhatsApp
 */
disconnectRoute.post('/', async (req, res) => {
  try {
    const currentState = getState();

    if (currentState === 'disconnected') {
      return res.json({
        success: true,
        message: 'Already disconnected'
      });
    }

    await disconnect();

    res.json({
      success: true,
      message: 'Disconnected from WhatsApp'
    });

  } catch (error) {
    console.error('[Disconnect] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to disconnect'
    });
  }
});
