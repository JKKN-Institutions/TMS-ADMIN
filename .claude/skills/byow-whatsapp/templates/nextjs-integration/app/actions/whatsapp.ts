'use server';

/**
 * WhatsApp Server Actions
 *
 * These server actions wrap the API client for use in React components.
 * They handle errors and provide consistent responses.
 */

import {
  connectWhatsAppAPI,
  getWhatsAppStatusAPI,
  sendMessageAPI,
  sendBulkMessagesAPI,
  disconnectWhatsAppAPI,
  checkNumberAPI
} from '../../lib/whatsapp/api-client';
import type { Recipient } from '../../types/whatsapp';

/**
 * Connect to WhatsApp and get QR code
 */
export async function connectWhatsApp() {
  try {
    const result = await connectWhatsAppAPI();
    return result;
  } catch (error) {
    console.error('[WhatsApp Action] Connect error:', error);
    return {
      success: false,
      status: 'disconnected' as const,
      message: error instanceof Error ? error.message : 'Failed to connect'
    };
  }
}

/**
 * Get current WhatsApp status
 */
export async function getWhatsAppStatus() {
  try {
    const result = await getWhatsAppStatusAPI();
    return result;
  } catch (error) {
    console.error('[WhatsApp Action] Status error:', error);
    return {
      success: false,
      status: 'disconnected' as const,
      qrCode: null,
      clientInfo: null,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Send a message to a phone number or group
 */
export async function sendWhatsAppMessage(to: string, message: string) {
  try {
    // Basic validation
    if (!to || !message) {
      return { success: false, error: 'Phone number and message are required' };
    }

    if (message.length > 4096) {
      return { success: false, error: 'Message too long (max 4096 characters)' };
    }

    const result = await sendMessageAPI(to, message);
    return result;
  } catch (error) {
    console.error('[WhatsApp Action] Send error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send message'
    };
  }
}

/**
 * Send messages to multiple recipients
 */
export async function sendBulkWhatsAppMessages(
  recipients: Recipient[],
  delayMs: number = 1500
) {
  try {
    // Basic validation
    if (!recipients || recipients.length === 0) {
      return { success: false, error: 'At least one recipient is required' };
    }

    for (const r of recipients) {
      if (!r.phone || !r.message) {
        return { success: false, error: 'Each recipient must have phone and message' };
      }
    }

    const result = await sendBulkMessagesAPI(recipients, delayMs);
    return result;
  } catch (error) {
    console.error('[WhatsApp Action] Bulk send error:', error);
    return {
      success: false,
      totalSent: 0,
      successCount: 0,
      failCount: 0,
      results: [],
      error: error instanceof Error ? error.message : 'Failed to send bulk messages'
    };
  }
}

/**
 * Check if a phone number is on WhatsApp
 */
export async function checkWhatsAppNumber(phone: string) {
  try {
    if (!phone) {
      return { success: false, phone: '', registered: false, error: 'Phone number is required' };
    }

    const result = await checkNumberAPI(phone);
    return result;
  } catch (error) {
    console.error('[WhatsApp Action] Check error:', error);
    return {
      success: false,
      phone,
      registered: false,
      error: error instanceof Error ? error.message : 'Failed to check number'
    };
  }
}

/**
 * Disconnect from WhatsApp
 */
export async function disconnectWhatsApp() {
  try {
    const result = await disconnectWhatsAppAPI();
    return result;
  } catch (error) {
    console.error('[WhatsApp Action] Disconnect error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to disconnect'
    };
  }
}
