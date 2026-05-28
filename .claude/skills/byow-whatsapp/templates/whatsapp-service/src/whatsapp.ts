import { Client, LocalAuth, Message } from 'whatsapp-web.js';
import * as qrcode from 'qrcode';

// Connection states
export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'qr_ready'
  | 'authenticated'
  | 'ready';

// Singleton client instance
let client: Client | null = null;
let currentState: ConnectionState = 'disconnected';
let currentQR: string | null = null;
let initPromise: Promise<void> | null = null;

// Configuration
const CLIENT_ID = process.env.CLIENT_ID || 'whatsapp-service';
const AUTH_PATH = process.env.AUTH_PATH || './.wwebjs_auth';
const INIT_TIMEOUT_MS = 120000; // 2 minutes

/**
 * Get current connection state
 */
export function getState(): ConnectionState {
  return currentState;
}

/**
 * Get current QR code as data URL
 */
export function getQRCode(): string | null {
  return currentQR;
}

/**
 * Initialize the WhatsApp client
 */
export async function initializeClient(): Promise<void> {
  // If already initializing, wait for that
  if (initPromise) {
    return initPromise;
  }

  // If already ready, return
  if (currentState === 'ready' && client) {
    return;
  }

  currentState = 'connecting';
  currentQR = null;

  initPromise = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      currentState = 'disconnected';
      initPromise = null;
      reject(new Error('QR_TIMEOUT'));
    }, INIT_TIMEOUT_MS);

    client = new Client({
      authStrategy: new LocalAuth({
        dataPath: AUTH_PATH,
        clientId: CLIENT_ID
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
      }
    });

    client.on('qr', async (qr) => {
      console.log('[WhatsApp] QR code received');
      try {
        currentQR = await qrcode.toDataURL(qr);
        currentState = 'qr_ready';
      } catch (err) {
        console.error('[WhatsApp] QR generation error:', err);
      }
    });

    client.on('authenticated', () => {
      console.log('[WhatsApp] Authenticated');
      currentState = 'authenticated';
      currentQR = null;
    });

    client.on('ready', () => {
      console.log('[WhatsApp] Client is ready');
      currentState = 'ready';
      clearTimeout(timeout);
      initPromise = null;
      resolve();
    });

    client.on('disconnected', (reason) => {
      console.log('[WhatsApp] Disconnected:', reason);
      currentState = 'disconnected';
      currentQR = null;
      client = null;
      initPromise = null;
    });

    client.on('auth_failure', (message) => {
      console.error('[WhatsApp] Auth failure:', message);
      currentState = 'disconnected';
      clearTimeout(timeout);
      initPromise = null;
      reject(new Error('AUTH_FAILURE'));
    });

    client.initialize().catch((err) => {
      console.error('[WhatsApp] Initialize error:', err);
      currentState = 'disconnected';
      clearTimeout(timeout);
      initPromise = null;
      reject(err);
    });
  });

  return initPromise;
}

/**
 * Format phone number to WhatsApp JID format
 */
export function formatPhoneNumber(phone: string): string {
  // Remove all non-digits
  let cleaned = phone.replace(/\D/g, '');

  // Handle Indian numbers
  if (cleaned.startsWith('0')) {
    cleaned = '91' + cleaned.substring(1);
  } else if (!cleaned.startsWith('91') && cleaned.length === 10) {
    cleaned = '91' + cleaned;
  }

  return `${cleaned}@c.us`;
}

/**
 * Check if a number is registered on WhatsApp
 */
export async function isRegistered(phone: string): Promise<boolean> {
  if (!client || currentState !== 'ready') {
    throw new Error('NOT_CONNECTED');
  }

  const jid = formatPhoneNumber(phone);
  const result = await client.isRegisteredUser(jid);
  return result;
}

/**
 * Send a message to a phone number or group
 */
export async function sendMessage(
  to: string,
  message: string
): Promise<Message> {
  if (!client || currentState !== 'ready') {
    throw new Error('NOT_CONNECTED');
  }

  // If it looks like a JID, use as-is; otherwise format as phone
  const chatId = to.includes('@') ? to : formatPhoneNumber(to);

  const result = await client.sendMessage(chatId, message);
  return result;
}

/**
 * Send bulk messages with delay
 */
export async function sendBulkMessages(
  recipients: Array<{ phone: string; message: string }>,
  delayMs: number = 1500
): Promise<Array<{ phone: string; success: boolean; error?: string }>> {
  if (!client || currentState !== 'ready') {
    throw new Error('NOT_CONNECTED');
  }

  const results: Array<{ phone: string; success: boolean; error?: string }> = [];

  for (let i = 0; i < recipients.length; i++) {
    const { phone, message } = recipients[i];

    try {
      await sendMessage(phone, message);
      results.push({ phone, success: true });
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      results.push({ phone, success: false, error });
    }

    // Add delay between messages (except for last one)
    if (i < recipients.length - 1) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  return results;
}

/**
 * Disconnect and cleanup
 */
export async function disconnect(): Promise<void> {
  if (client) {
    await client.logout();
    await client.destroy();
    client = null;
  }
  currentState = 'disconnected';
  currentQR = null;
  initPromise = null;
}

/**
 * Get client info when connected
 */
export function getClientInfo(): { phoneNumber?: string; pushName?: string } | null {
  if (!client || currentState !== 'ready') {
    return null;
  }

  const info = client.info;
  return {
    phoneNumber: info?.wid?.user,
    pushName: info?.pushname
  };
}
