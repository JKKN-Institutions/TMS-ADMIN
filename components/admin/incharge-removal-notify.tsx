'use client';

/**
 * Operator panel for sending the removal-bill explanation to in-charges who were
 * removed and billed without being told.
 *
 * Deliberately two steps. The enforcement catch-up ran in quiet mode, so this
 * button is the moment ~35 real people learn they owe money — and the message
 * is the ONLY explanation they get, because removal locks them out of every
 * boarding screen that has a notification bell. Send is therefore disabled until
 * the operator has loaded a preview and read the exact text that will go out.
 *
 * No window.confirm: a browser modal blocks the tab and would strand a send
 * half-reported.
 */

import React, { useState } from 'react';
import { Loader2, MailCheck, Send, Eye } from 'lucide-react';
import toast from 'react-hot-toast';

const ENDPOINT = '/api/admin/incharge-attendance-strikes/notify';

interface PreviewRow {
  staffEmail: string;
  route: string;
  amount: number;
  title: string;
  body: string;
}

interface Summary {
  dryRun: boolean;
  candidates: number;
  sent: number;
  alreadySent: number;
  unreachable: number;
  errors: number;
  failures: Array<{ staffEmail: string; message: string }>;
  preview: PreviewRow[];
}

async function post(dryRun: boolean): Promise<Summary> {
  const res = await fetch(`${ENDPOINT}${dryRun ? '?dryRun=1' : ''}`, {
    method: 'POST',
    credentials: 'same-origin',
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Request failed');
  return json.data as Summary;
}

function inr(amount: number): string {
  return `₹${Number(amount).toLocaleString('en-IN')}`;
}

export default function InchargeRemovalNotify() {
  const [preview, setPreview] = useState<Summary | null>(null);
  const [result, setResult] = useState<Summary | null>(null);
  const [busy, setBusy] = useState<'preview' | 'send' | null>(null);
  const [confirming, setConfirming] = useState(false);

  const pending = preview ? preview.preview.length : 0;

  async function runPreview() {
    setBusy('preview');
    setConfirming(false);
    setResult(null);
    try {
      setPreview(await post(true));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      setBusy(null);
    }
  }

  async function runSend() {
    setBusy('send');
    try {
      const summary = await post(false);
      setResult(summary);
      setConfirming(false);
      // Re-preview so the panel immediately reflects the new already-sent state
      // rather than still offering to send the people just messaged.
      setPreview(await post(true));
      toast.success(`Sent ${summary.sent} notice${summary.sent === 1 ? '' : 's'}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-w-0 rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-100">
            <MailCheck className="h-4 w-4 shrink-0" />
            Removal-bill notices
          </h2>
          <p className="mt-1 text-sm text-amber-900/80 dark:text-amber-200/80">
            In-charges removed by the attendance ladder were billed without being notified. Preview the
            exact message each one will receive, then send. Sending twice is safe — nobody is messaged
            twice.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={runPreview}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-md border border-amber-400 px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:text-amber-100 dark:hover:bg-amber-900/40"
          >
            {busy === 'preview' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
            Preview messages
          </button>
          <button
            type="button"
            onClick={() => (confirming ? runSend() : setConfirming(true))}
            disabled={busy !== null || !preview || pending === 0}
            className="inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy === 'send' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {confirming ? `Yes — notify ${pending} now` : 'Send notices'}
          </button>
        </div>
      </div>

      {confirming && (
        <p className="mt-3 rounded bg-red-100 px-3 py-2 text-sm font-medium text-red-900 dark:bg-red-900/40 dark:text-red-100">
          This messages {pending} real {pending === 1 ? 'person' : 'people'} that they have been removed
          and billed. Press again to confirm, or Preview to cancel.
        </p>
      )}

      {preview && (
        <div className="mt-3 text-sm text-amber-900 dark:text-amber-100">
          <p className="font-medium">
            {pending} will be notified · {preview.alreadySent} already notified ·{' '}
            {preview.unreachable} unreachable · {preview.candidates} removed and billed in total
          </p>
          {preview.unreachable > 0 && (
            <p className="mt-1 text-amber-800 dark:text-amber-300">
              Unreachable staff have no login to deliver to: {preview.failures.map((f) => f.staffEmail).join(', ')}
            </p>
          )}
          {pending > 0 && (
            <ul className="mt-3 max-h-96 space-y-3 overflow-y-auto pr-1">
              {preview.preview.map((p) => (
                <li
                  key={p.staffEmail + p.route}
                  className="rounded border border-amber-200 bg-white p-3 dark:border-amber-800 dark:bg-gray-900"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{p.staffEmail}</span>
                    <span className="shrink-0">
                      Route {p.route} · {inr(p.amount)}
                    </span>
                  </div>
                  <p className="mt-1 font-medium">{p.title}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{p.body}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {result && (
        <p className="mt-3 rounded bg-green-100 px-3 py-2 text-sm text-green-900 dark:bg-green-900/40 dark:text-green-100">
          Sent {result.sent} · already sent {result.alreadySent} · unreachable {result.unreachable} ·
          errors {result.errors}
          {result.failures.length > 0 && (
            <span className="mt-1 block text-xs">
              {result.failures.map((f) => `${f.staffEmail}: ${f.message}`).join(' — ')}
            </span>
          )}
        </p>
      )}
    </div>
  );
}
