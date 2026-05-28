import { Router } from 'express';
import { sendMessage, sendBulkMessages, getState, isRegistered } from '../whatsapp';

export const sendRoute = Router();

/**
 * POST /send
 * Send a single message
 *
 * Body: { to: string, message: string }
 */
sendRoute.post('/', async (req, res) => {
  try {
    const { to, message } = req.body;

    // Validate input
    if (!to || !message) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: to, message'
      });
    }

    // Check connection state
    if (getState() !== 'ready') {
      return res.status(503).json({
        success: false,
        error: 'WhatsApp not connected',
        code: 'NOT_CONNECTED'
      });
    }

    // Validate message length
    if (message.length > 4096) {
      return res.status(400).json({
        success: false,
        error: 'Message too long (max 4096 characters)'
      });
    }

    // Send message
    const result = await sendMessage(to, message);

    res.json({
      success: true,
      messageId: result.id?.id,
      timestamp: result.timestamp
    });

  } catch (error) {
    console.error('[Send] Error:', error);

    const err = error as Error;

    if (err.message === 'NOT_CONNECTED') {
      return res.status(503).json({
        success: false,
        error: 'WhatsApp not connected',
        code: 'NOT_CONNECTED'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to send message'
    });
  }
});

/**
 * POST /send-bulk
 * Send messages to multiple recipients
 *
 * Body: { recipients: Array<{ phone: string, message: string }>, delayMs?: number }
 */
sendRoute.post('-bulk', async (req, res) => {
  try {
    const { recipients, delayMs = 1500 } = req.body;

    // Validate input
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid recipients array'
      });
    }

    // Check connection state
    if (getState() !== 'ready') {
      return res.status(503).json({
        success: false,
        error: 'WhatsApp not connected',
        code: 'NOT_CONNECTED'
      });
    }

    // Validate each recipient
    for (const r of recipients) {
      if (!r.phone || !r.message) {
        return res.status(400).json({
          success: false,
          error: 'Each recipient must have phone and message fields'
        });
      }
    }

    // Send bulk messages
    const results = await sendBulkMessages(recipients, delayMs);

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    res.json({
      success: true,
      totalSent: recipients.length,
      successCount,
      failCount,
      results
    });

  } catch (error) {
    console.error('[SendBulk] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send bulk messages'
    });
  }
});

/**
 * POST /send/check
 * Check if a number is registered on WhatsApp
 *
 * Body: { phone: string }
 */
sendRoute.post('/check', async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: phone'
      });
    }

    if (getState() !== 'ready') {
      return res.status(503).json({
        success: false,
        error: 'WhatsApp not connected',
        code: 'NOT_CONNECTED'
      });
    }

    const registered = await isRegistered(phone);

    res.json({
      success: true,
      phone,
      registered
    });

  } catch (error) {
    console.error('[Check] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check number'
    });
  }
});
