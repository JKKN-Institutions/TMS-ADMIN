'use client';

/**
 * WhatsApp Connect Component
 *
 * Displays QR code for WhatsApp authentication and connection status.
 * Poll for status updates to show real-time connection state.
 */

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import {
  connectWhatsApp,
  getWhatsAppStatus,
  disconnectWhatsApp
} from '../app/actions/whatsapp';
import type { ConnectionState } from '../types/whatsapp';

interface WhatsAppConnectProps {
  onConnected?: (phoneNumber: string) => void;
  onDisconnected?: () => void;
  pollIntervalMs?: number;
}

export function WhatsAppConnect({
  onConnected,
  onDisconnected,
  pollIntervalMs = 2000
}: WhatsAppConnectProps) {
  const [status, setStatus] = useState<ConnectionState>('disconnected');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch current status
  const fetchStatus = useCallback(async () => {
    try {
      const result = await getWhatsAppStatus();
      setStatus(result.status);
      setQrCode(result.qrCode || null);

      if (result.clientInfo?.phoneNumber) {
        setPhoneNumber(result.clientInfo.phoneNumber);
      }

      if (result.status === 'ready' && result.clientInfo?.phoneNumber) {
        onConnected?.(result.clientInfo.phoneNumber);
      }
    } catch (err) {
      console.error('Status fetch error:', err);
    }
  }, [onConnected]);

  // Poll for status when connecting
  useEffect(() => {
    if (status === 'connecting' || status === 'qr_ready' || status === 'authenticated') {
      const interval = setInterval(fetchStatus, pollIntervalMs);
      return () => clearInterval(interval);
    }
  }, [status, fetchStatus, pollIntervalMs]);

  // Initial status check
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Handle connect button click
  const handleConnect = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await connectWhatsApp();

      if (!result.success) {
        setError(result.message || 'Failed to connect');
        return;
      }

      setStatus(result.status);
      if (result.qrCode) {
        setQrCode(result.qrCode);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
    } finally {
      setLoading(false);
    }
  };

  // Handle disconnect button click
  const handleDisconnect = async () => {
    setLoading(true);
    setError(null);

    try {
      await disconnectWhatsApp();
      setStatus('disconnected');
      setQrCode(null);
      setPhoneNumber(null);
      onDisconnected?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
    } finally {
      setLoading(false);
    }
  };

  // Render based on status
  return (
    <div className="whatsapp-connect">
      {/* Error display */}
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {/* Disconnected state */}
      {status === 'disconnected' && (
        <div className="disconnected-state">
          <p>Connect your WhatsApp account to send messages.</p>
          <button
            onClick={handleConnect}
            disabled={loading}
            className="connect-button"
          >
            {loading ? 'Connecting...' : 'Connect WhatsApp'}
          </button>
        </div>
      )}

      {/* Connecting state */}
      {status === 'connecting' && (
        <div className="connecting-state">
          <div className="spinner" />
          <p>Initializing WhatsApp...</p>
        </div>
      )}

      {/* QR Ready state */}
      {status === 'qr_ready' && qrCode && (
        <div className="qr-state">
          <p>Scan this QR code with WhatsApp on your phone:</p>
          <div className="qr-container">
            <Image
              src={qrCode}
              alt="WhatsApp QR Code"
              width={256}
              height={256}
              priority
            />
          </div>
          <p className="instructions">
            Open WhatsApp → Settings → Linked Devices → Link a Device
          </p>
        </div>
      )}

      {/* Authenticated state */}
      {status === 'authenticated' && (
        <div className="authenticated-state">
          <div className="spinner" />
          <p>Authenticated! Finalizing connection...</p>
        </div>
      )}

      {/* Ready state */}
      {status === 'ready' && (
        <div className="ready-state">
          <div className="success-icon">✓</div>
          <p>WhatsApp Connected</p>
          {phoneNumber && (
            <p className="phone-number">+{phoneNumber}</p>
          )}
          <button
            onClick={handleDisconnect}
            disabled={loading}
            className="disconnect-button"
          >
            {loading ? 'Disconnecting...' : 'Disconnect'}
          </button>
        </div>
      )}

      {/* Styles - replace with your preferred styling solution */}
      <style jsx>{`
        .whatsapp-connect {
          padding: 1.5rem;
          border: 1px solid #e5e7eb;
          border-radius: 0.5rem;
          max-width: 400px;
        }

        .error-message {
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #dc2626;
          padding: 0.75rem;
          border-radius: 0.375rem;
          margin-bottom: 1rem;
        }

        .connect-button {
          background: #25d366;
          color: white;
          padding: 0.75rem 1.5rem;
          border: none;
          border-radius: 0.375rem;
          font-weight: 500;
          cursor: pointer;
        }

        .connect-button:hover {
          background: #20bd5a;
        }

        .connect-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .disconnect-button {
          background: #ef4444;
          color: white;
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 0.375rem;
          cursor: pointer;
        }

        .disconnect-button:hover {
          background: #dc2626;
        }

        .spinner {
          width: 2rem;
          height: 2rem;
          border: 3px solid #e5e7eb;
          border-top-color: #25d366;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .qr-container {
          padding: 1rem;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 0.5rem;
          display: inline-block;
          margin: 1rem 0;
        }

        .instructions {
          font-size: 0.875rem;
          color: #6b7280;
        }

        .success-icon {
          width: 3rem;
          height: 3rem;
          background: #25d366;
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
          margin: 0 auto 1rem;
        }

        .phone-number {
          font-weight: 500;
          color: #374151;
        }

        .connecting-state,
        .authenticated-state,
        .qr-state,
        .ready-state,
        .disconnected-state {
          text-align: center;
        }
      `}</style>
    </div>
  );
}
