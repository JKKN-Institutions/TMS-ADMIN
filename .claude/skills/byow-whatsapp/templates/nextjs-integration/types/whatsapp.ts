/**
 * WhatsApp integration type definitions
 */

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'qr_ready'
  | 'authenticated'
  | 'ready';

export interface WhatsAppStatus {
  success: boolean;
  status: ConnectionState;
  qrCode?: string | null;
  clientInfo?: {
    phoneNumber?: string;
    pushName?: string;
  } | null;
  timestamp: string;
}

export interface ConnectResponse {
  success: boolean;
  status: ConnectionState;
  qrCode?: string;
  message: string;
}

export interface SendResponse {
  success: boolean;
  messageId?: string;
  timestamp?: number;
  error?: string;
}

export interface BulkSendResult {
  phone: string;
  success: boolean;
  error?: string;
}

export interface BulkSendResponse {
  success: boolean;
  totalSent: number;
  successCount: number;
  failCount: number;
  results: BulkSendResult[];
  error?: string;
}

export interface Recipient {
  phone: string;
  message: string;
}

export interface WhatsAppGroup {
  id: string;
  name: string;
  jid: string;
}
