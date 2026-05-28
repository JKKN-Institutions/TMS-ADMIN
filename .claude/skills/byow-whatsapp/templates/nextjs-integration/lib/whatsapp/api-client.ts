/**
 * WhatsApp API Client
 *
 * Client for communicating with the WhatsApp service deployed on Railway
 */

import type {
  WhatsAppStatus,
  ConnectResponse,
  SendResponse,
  BulkSendResponse,
  Recipient
} from '../../types/whatsapp';

// Get service URL from environment
const WHATSAPP_SERVICE_URL = process.env.WHATSAPP_SERVICE_URL;
const WHATSAPP_API_KEY = process.env.WHATSAPP_API_KEY;

/**
 * Make authenticated request to WhatsApp service
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  if (!WHATSAPP_SERVICE_URL) {
    throw new Error('WHATSAPP_SERVICE_URL not configured');
  }

  if (!WHATSAPP_API_KEY) {
    throw new Error('WHATSAPP_API_KEY not configured');
  }

  const url = `${WHATSAPP_SERVICE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': WHATSAPP_API_KEY,
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Initialize WhatsApp connection and get QR code
 */
export async function connectWhatsAppAPI(): Promise<ConnectResponse> {
  return apiRequest<ConnectResponse>('/connect', {
    method: 'POST'
  });
}

/**
 * Get current WhatsApp connection status
 */
export async function getWhatsAppStatusAPI(): Promise<WhatsAppStatus> {
  return apiRequest<WhatsAppStatus>('/status', {
    method: 'GET'
  });
}

/**
 * Send a single message
 */
export async function sendMessageAPI(
  to: string,
  message: string
): Promise<SendResponse> {
  return apiRequest<SendResponse>('/send', {
    method: 'POST',
    body: JSON.stringify({ to, message })
  });
}

/**
 * Send messages to multiple recipients
 */
export async function sendBulkMessagesAPI(
  recipients: Recipient[],
  delayMs: number = 1500
): Promise<BulkSendResponse> {
  return apiRequest<BulkSendResponse>('/send-bulk', {
    method: 'POST',
    body: JSON.stringify({ recipients, delayMs })
  });
}

/**
 * Check if a phone number is registered on WhatsApp
 */
export async function checkNumberAPI(
  phone: string
): Promise<{ success: boolean; phone: string; registered: boolean }> {
  return apiRequest('/send/check', {
    method: 'POST',
    body: JSON.stringify({ phone })
  });
}

/**
 * Disconnect from WhatsApp
 */
export async function disconnectWhatsAppAPI(): Promise<{ success: boolean; message: string }> {
  return apiRequest('/disconnect', {
    method: 'POST'
  });
}
