---
name: meta-whatsapp-integration
description: "Meta WhatsApp Business API integration skill for connecting any MyJKKN module to WhatsApp messaging. Use this skill whenever the user wants to: add WhatsApp messaging to a new module, send template messages from any module, create WhatsApp auto-send on entity creation, build message queues with retry logic, handle WhatsApp webhooks, manage consent/opt-in, set up WhatsApp campaigns, connect a module to the existing WhatsApp infrastructure, debug WhatsApp API errors, or configure Meta Business templates. Also triggers when user mentions: WhatsApp, WABA, Meta Cloud API, wa_opt_in, message queue, template message, WhatsApp webhook, or WhatsApp consent."
---

# Meta WhatsApp Business Integration — Module Connection Skill

This skill guides you through connecting **any MyJKKN module** to the existing WhatsApp Meta Business infrastructure. The patterns are proven and battle-tested from the Expo module integration.

## Architecture Overview

MyJKKN uses a layered WhatsApp architecture:

```
┌─────────────────────────────────────────────────────────┐
│  Module Layer (YOUR NEW MODULE)                          │
│  e.g., Billing, Attendance, Admissions, Library          │
│  → Module-specific WhatsApp service                      │
│  → Module-specific message queue table                   │
│  → Module-specific API route                             │
└──────────────────────┬──────────────────────────────────┘
                       │ Uses
┌──────────────────────▼──────────────────────────────────┐
│  Core WhatsApp Layer (ALREADY BUILT)                     │
│  lib/services/whatsapp/whatsapp-api-client.ts           │
│  → sendTemplateMessage(), sendTextMessage()              │
│  → Multi-institution via wa_phone_numbers table          │
│  → Webhook handler at /api/webhooks/whatsapp             │
│  → Conversation tracking (wa_conversations, wa_messages) │
│  → Consent service (DPDPA compliant)                     │
└──────────────────────┬──────────────────────────────────┘
                       │ Calls
┌──────────────────────▼──────────────────────────────────┐
│  Meta Cloud API v21.0                                    │
│  https://graph.facebook.com/v21.0/{phone_id}/messages    │
│  → Template messages (proactive, needs approved template)│
│  → Text messages (within 24hr customer service window)   │
│  → Media messages (image, video, document, audio)        │
│  → Interactive messages (buttons, lists)                 │
└─────────────────────────────────────────────────────────┘
```

## Before You Start — Checklist

Before connecting a new module, verify these prerequisites:

1. **Environment variables configured** in `.env`:
   ```
   WHATSAPP_ACCESS_TOKEN=<system-user-token>
   WHATSAPP_PHONE_NUMBER_ID=<phone-number-id>
   ```
   Verify: Read `.env` and grep for `WHATSAPP_`

2. **Core WhatsApp client exists** at `lib/services/whatsapp/whatsapp-api-client.ts`
   - Exports: `sendTemplateMessage()`, `sendTextMessage()`, `isWhatsAppConfigured()`
   - Never modify this file for module-specific logic

3. **Meta template approved** for your use case on the correct WABA
   - Templates are WABA-specific — verify on the same WABA as the phone number
   - Check via API: `GET https://graph.facebook.com/v21.0/{waba_id}/message_templates`

4. **Webhook handler** exists at `app/api/webhooks/whatsapp/route.ts`
   - Handles inbound messages and delivery status updates
   - Already supports multi-module routing via conversation tags

---

## Step-by-Step: Connect a New Module

### Step 1: Define Your Module's WhatsApp Requirements

Answer these questions before writing code:

| Question | Example (Expo Module) | Your Module |
|----------|----------------------|-------------|
| What event triggers a WA message? | Lead captured at expo | ? |
| What template will you use? | `exhibition_thankyou` | ? |
| How many template parameters? | 3 (name, event, program) | ? |
| What entity stores consent? | `admission_leads.wa_opt_in` | ? |
| Need a message queue? | Yes (retry on failure) | ? |
| Need conversation tracking? | Yes (for replies) | ? |
| Daily send limit? | 950 (TIER_1K safety) | ? |

### Step 2: Create the Module-Specific WhatsApp Service

Create a new service file following the proven pattern:

**File:** `lib/services/{module}/{module}-whatsapp-service.ts`

```typescript
// lib/services/{module}/{module}-whatsapp-service.ts
// {Module} WhatsApp Integration — sends messages for {use case}
// Uses Meta Cloud API via whatsapp-api-client, respects DPDPA consent

import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  sendTemplateMessage,
  isWhatsAppConfigured,
  type WATemplateComponent,
} from '@/lib/services/whatsapp/whatsapp-api-client';

// =============================================================================
// Types
// =============================================================================

export interface {Module}WAInput {
  // Entity reference
  entityId: string;           // The ID of the entity triggering the message
  
  // Recipient info
  recipientPhone: string;     // Phone number to send to
  recipientName: string;      // Name for template personalization
  
  // Template variables (module-specific)
  // Add fields matching your template's {{1}}, {{2}}, etc.
  
  // Context
  institutionId: string;
  // Add any module-specific context fields
}

export interface SendResult {
  success: boolean;
  waMessageId?: string;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
}

// =============================================================================
// Constants
// =============================================================================

const TEMPLATE_NAME = '{your_template_name}';  // Must match Meta-approved template
const TEMPLATE_LANGUAGE = 'en';
const DAILY_LIMIT = 950;  // Stay under TIER_1K (1000) with safety margin

// =============================================================================
// Service
// =============================================================================

export class {Module}WhatsAppService {
  /**
   * Send WhatsApp message for this module's use case.
   * Checks: WA configured, consent given, daily limit not exceeded.
   * Non-blocking — caller should wrap in try/catch.
   */
  static async send{Action}(input: {Module}WAInput): Promise<SendResult> {
    // 1. Check if WhatsApp Cloud API is configured
    if (!isWhatsAppConfigured()) {
      return { success: false, skipped: true, skipReason: 'whatsapp_not_configured' };
    }

    const supabase = createServiceRoleClient();

    // 2. Check consent — respect DPDPA opt-out
    //    Replace with your entity's consent field
    const { data: entity } = await (supabase as any)
      .from('{your_entity_table}')
      .select('wa_opt_in')
      .eq('id', input.entityId)
      .single();

    if (!entity?.wa_opt_in) {
      return { success: false, skipped: true, skipReason: 'no_consent' };
    }

    // 3. Check daily send limit (TIER_1K safety)
    const today = new Date().toISOString().split('T')[0];
    const { count } = await (supabase as any)
      .from('{module}_wa_message_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'sent')
      .gte('created_at', `${today}T00:00:00.000Z`);

    if ((count ?? 0) >= DAILY_LIMIT) {
      await this.queueMessage(supabase, input, 'daily_limit_reached');
      return { success: false, skipped: true, skipReason: 'daily_limit_reached' };
    }

    // 4. Format phone for WhatsApp
    const phone = formatPhoneForWA(input.recipientPhone);

    // 5. Build template parameters
    const components = buildTemplateComponents(input);

    // 6. Send via Cloud API
    try {
      const waResponse = await sendTemplateMessage(
        phone,
        TEMPLATE_NAME,
        TEMPLATE_LANGUAGE,
        components
      );

      const waMessageId = waResponse.messages?.[0]?.id;

      // 7. Log to message queue table
      await this.logMessage(supabase, {
        entityId: input.entityId,
        phone,
        templateName: TEMPLATE_NAME,
        status: 'sent',
        waMessageId: waMessageId || null,
      });

      // 8. Create/update wa_conversation for bidirectional chat
      await this.ensureConversation(supabase, input, waMessageId);

      return { success: true, waMessageId };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[{module}/wa] Failed to send:`, {
        entityId: input.entityId,
        phone,
        error: errorMsg,
      });

      // Log failed attempt for retry
      await this.logMessage(supabase, {
        entityId: input.entityId,
        phone,
        templateName: TEMPLATE_NAME,
        status: 'failed',
        waMessageId: null,
        errorMessage: errorMsg,
      });

      return { success: false, error: errorMsg };
    }
  }

  // --- Private helpers ---

  private static async logMessage(supabase: any, params: {
    entityId: string;
    phone: string;
    templateName: string;
    status: string;
    waMessageId: string | null;
    errorMessage?: string;
  }) {
    await supabase.from('{module}_wa_message_queue').insert({
      {entity_fk_column}: params.entityId,
      phone: params.phone,
      template_name: params.templateName,
      status: params.status,
      wa_message_id: params.waMessageId,
      error_message: params.errorMessage || null,
    });
  }

  private static async ensureConversation(supabase: any, input: {Module}WAInput, waMessageId?: string) {
    const phone = formatPhoneForWA(input.recipientPhone);

    // Check for existing conversation
    const { data: existing } = await supabase
      .from('wa_conversations')
      .select('id')
      .eq('institution_id', input.institutionId)
      .eq('contact_phone', phone)
      .single();

    if (existing) {
      await supabase
        .from('wa_conversations')
        .update({
          last_message_at: new Date().toISOString(),
          status: 'waiting',
        })
        .eq('id', existing.id);
    } else {
      const { data: conv } = await supabase
        .from('wa_conversations')
        .insert({
          institution_id: input.institutionId,
          contact_phone: phone,
          contact_name: input.recipientName,
          status: 'waiting',
          tags: ['{module}'],  // Tag for module-based routing
          metadata: { source: '{module}', entityId: input.entityId },
        })
        .select('id')
        .single();

      if (conv && waMessageId) {
        await supabase.from('wa_messages').insert({
          conversation_id: conv.id,
          wa_message_id: waMessageId,
          direction: 'outbound',
          sender_type: 'system',
          message_type: 'template',
          content: { template_name: TEMPLATE_NAME, context: '{module}' },
          status: 'sent',
        });
      }
    }
  }

  private static async queueMessage(supabase: any, input: {Module}WAInput, reason: string) {
    await supabase.from('{module}_wa_message_queue').insert({
      {entity_fk_column}: input.entityId,
      phone: formatPhoneForWA(input.recipientPhone),
      template_name: TEMPLATE_NAME,
      status: 'queued',
      error_message: reason,
    });
  }

  /**
   * Process queued/failed messages with retry logic.
   * Called by cron endpoint.
   */
  static async processQueue(): Promise<{ processed: number; sent: number; failed: number }> {
    const supabase = createServiceRoleClient();
    let processed = 0, sent = 0, failed = 0;

    const { data: pending } = await (supabase as any)
      .from('{module}_wa_message_queue')
      .select('*')
      .in('status', ['queued', 'failed'])
      .lt('retry_count', 3)
      .or(`next_retry_at.is.null,next_retry_at.lte.${new Date().toISOString()}`)
      .order('created_at', { ascending: true })
      .limit(50);

    if (!pending?.length) return { processed: 0, sent: 0, failed: 0 };

    for (const msg of pending) {
      processed++;
      try {
        const waResponse = await sendTemplateMessage(
          msg.phone,
          msg.template_name,
          TEMPLATE_LANGUAGE,
          msg.template_params ? JSON.parse(msg.template_params) : []
        );

        await supabase
          .from('{module}_wa_message_queue')
          .update({
            status: 'sent',
            wa_message_id: waResponse.messages?.[0]?.id || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', msg.id);

        sent++;
      } catch (err) {
        const newRetryCount = (msg.retry_count || 0) + 1;
        const backoffMinutes = 30 * Math.pow(2, newRetryCount - 1); // 30, 60, 120

        await supabase
          .from('{module}_wa_message_queue')
          .update({
            status: newRetryCount >= 3 ? 'permanently_failed' : 'failed',
            retry_count: newRetryCount,
            next_retry_at: new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString(),
            error_message: err instanceof Error ? err.message : 'Unknown error',
            updated_at: new Date().toISOString(),
          })
          .eq('id', msg.id);

        failed++;
      }
    }

    return { processed, sent, failed };
  }
}

// =============================================================================
// Helpers (module-private)
// =============================================================================

/** Standardize phone to 91XXXXXXXXXX format (no +, no spaces) */
function formatPhoneForWA(phone: string): string {
  let clean = phone.replace(/[\s\-()]/g, '');
  if (clean.startsWith('+91')) {
    clean = clean.slice(1);
  } else if (clean.startsWith('0')) {
    clean = '91' + clean.slice(1);
  } else if (/^[6-9]\d{9}$/.test(clean)) {
    clean = '91' + clean;
  }
  return clean;
}

/** Build template components — customize for your template's parameters */
function buildTemplateComponents(input: {Module}WAInput): WATemplateComponent[] {
  // Match your Meta-approved template's {{1}}, {{2}}, {{3}} variables
  return [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: input.recipientName },
        // Add more parameters matching your template
      ],
    },
  ];
}
```

### Step 3: Create the API Route

**File:** `app/api/{module}/wa-send/route.ts`

```typescript
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { getAuthUser } from '@/lib/supabase/server';
import { {Module}WhatsAppService } from '@/lib/services/{module}/{module}-whatsapp-service';

export async function POST(request: NextRequest) {
  await connection();

  const { user, error: authError } = await getAuthUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    // Destructure and validate your module-specific fields
    const { entityId, recipientPhone, recipientName, institutionId, ...rest } = body;

    if (!entityId || !recipientPhone || !recipientName || !institutionId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const result = await {Module}WhatsAppService.send{Action}({
      entityId,
      recipientPhone,
      recipientName,
      institutionId,
      ...rest,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('[{module}/wa] Route error:', err);
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : 'Internal error',
    });
  }
}
```

### Step 4: Create the Message Queue Table

Add to `supabase/setup/01_tables.sql` (never create a separate file):

```sql
-- {Module} WhatsApp Message Queue
-- Tracks outbound template messages with retry support
CREATE TABLE IF NOT EXISTS {module}_wa_message_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  {entity_fk_column} UUID NOT NULL REFERENCES {entity_table}(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  template_name TEXT NOT NULL DEFAULT '{template_name}',
  template_params JSONB DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'delivered', 'read', 'failed', 'permanently_failed', 'skipped')),
  wa_message_id TEXT,
  retry_count INT DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for queue processing
CREATE INDEX IF NOT EXISTS idx_{module}_wa_queue_status
  ON {module}_wa_message_queue(status) WHERE status IN ('queued', 'failed');
CREATE INDEX IF NOT EXISTS idx_{module}_wa_queue_entity
  ON {module}_wa_message_queue({entity_fk_column});
```

### Step 5: Add Consent Fields to Your Entity Table

If your entity table doesn't already have WhatsApp consent columns:

```sql
ALTER TABLE {entity_table} ADD COLUMN IF NOT EXISTS wa_opt_in BOOLEAN DEFAULT false;
ALTER TABLE {entity_table} ADD COLUMN IF NOT EXISTS wa_opt_in_at TIMESTAMPTZ;
ALTER TABLE {entity_table} ADD COLUMN IF NOT EXISTS wa_opt_in_source VARCHAR(50);
ALTER TABLE {entity_table} ADD COLUMN IF NOT EXISTS wa_opt_out_at TIMESTAMPTZ;
```

### Step 6: Add WhatsApp Consent UI to Your Form

Add the consent checkbox to your module's form component:

```tsx
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { MessageCircle } from 'lucide-react';

// Inside your form JSX:
<div className="flex items-start gap-3 rounded-lg border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/30 p-4">
  <Checkbox
    id="waOptIn"
    checked={form.waOptIn}
    onCheckedChange={(checked) => updateField('waOptIn', checked === true)}
    disabled={isSubmitting}
    className="mt-0.5"
  />
  <div className="flex-1">
    <Label htmlFor="waOptIn" className="text-sm font-medium cursor-pointer flex items-center gap-2">
      <MessageCircle className="h-4 w-4 text-green-600" />
      WhatsApp Updates
    </Label>
    <p className="text-xs text-muted-foreground mt-1">
      I consent to receive updates and information via WhatsApp.
    </p>
  </div>
</div>
```

### Step 7: Trigger WhatsApp on Entity Creation

In your form's submit handler, add the fire-and-forget WA call:

```typescript
// After successful entity creation:
if (form.waOptIn && createdEntity?.id) {
  fetch('/api/{module}/wa-send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      entityId: createdEntity.id,
      recipientPhone: form.phone.trim(),
      recipientName: form.name.trim(),
      institutionId: selectedInstitutionId,
      // ... module-specific fields
    }),
  }).catch(() => { /* silent — WA failure never blocks entity creation */ });
}
```

### Step 8: Create Queue Processor (Cron Endpoint)

**File:** `app/api/{module}/wa-queue/route.ts`

```typescript
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { {Module}WhatsAppService } from '@/lib/services/{module}/{module}-whatsapp-service';

export async function POST(request: NextRequest) {
  await connection();

  // Verify cron secret or auth
  const cronSecret = request.headers.get('x-cron-secret');
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await {Module}WhatsAppService.processQueue();
  return NextResponse.json(result);
}

export async function GET() {
  // Return queue stats (for monitoring dashboards)
  // Implement as needed
  return NextResponse.json({ status: 'ok' });
}
```

---

## Meta Template Setup Guide

### Template Requirements

| Rule | Details |
|------|---------|
| **Name** | Lowercase, underscores only: `{module}_{action}` |
| **Category** | Marketing (proactive), Utility (transactional), Authentication |
| **Parameters** | Use `{{1}}`, `{{2}}`, `{{3}}` for positional variables |
| **Max params** | Keep under 5 for simplicity |
| **Sample values** | Required when submitting — use realistic examples |
| **Approval time** | Minutes to hours (Marketing), usually faster for Utility |

### Common Template Patterns for JKKN Modules

```
# Admission — Application Received
"Hi {{1}}, your application for {{2}} at JKKN has been received! 
Application ID: {{3}}. We'll review and get back to you soon."

# Billing — Fee Reminder  
"Hi {{1}}, this is a reminder that your fee of Rs.{{2}} for {{3}} 
is due on {{4}}. Pay online: jkkn.ac.in/pay"

# Attendance — Absence Alert (to parent)
"Dear {{1}}, your ward {{2}} was absent today ({{3}}) from {{4}}. 
Please contact the institution if needed."

# Academic — Exam Schedule
"Hi {{1}}, your {{2}} exam is scheduled for {{3}} at {{4}}. 
All the best! - JKKN Institutions"
```

### Verifying Template Exists on Your WABA

Before coding, verify the template exists via API:

```bash
curl -s -X POST "https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages" \
  -H "Authorization: Bearer {ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "{TEST_PHONE_WITH_91}",
    "type": "template",
    "template": {
      "name": "{template_name}",
      "language": { "code": "en" },
      "components": [{
        "type": "body",
        "parameters": [
          { "type": "text", "text": "Test" }
        ]
      }]
    }
  }'
```

**Success:** `{ "messages": [{ "id": "wamid.xxx" }] }`
**Template not found:** Error 132001
**Wrong param count:** Error 132000
**Phone not registered:** Error 133010

---

## Debugging WhatsApp API Errors

| Error Code | Meaning | Fix |
|------------|---------|-----|
| **100** | Object doesn't exist | Wrong phone_number_id — check `.env` matches Meta dashboard |
| **132000** | Wrong parameter count | Template expects N params, you sent M — check `buildTemplateComponents()` |
| **132001** | Template not found | Template doesn't exist on this WABA, or wrong language code |
| **133010** | Phone not registered | The WABA phone number hasn't completed OTP verification |
| **131026** | Rate limited | Slow down, you're sending too fast |
| **131047** | 24hr window expired | Use template message instead of text message |
| **131031** | Business locked | Account restricted by Meta — check Business Manager |
| **-1** | System unavailable | Meta is down — retry later |

### Debugging Steps

1. **Verify token:** `GET https://graph.facebook.com/v21.0/debug_token?input_token={TOKEN}&access_token={TOKEN}`
2. **Verify phone number:** `GET https://graph.facebook.com/v21.0/{PHONE_ID}?fields=display_phone_number,verified_name,status,quality_rating`
3. **List templates:** `GET https://graph.facebook.com/v21.0/{WABA_ID}/message_templates`
4. **List phone numbers:** `GET https://graph.facebook.com/v21.0/{WABA_ID}/phone_numbers`
5. **Test with text message** (simpler, no template needed — but requires 24hr window)

---

## Key Files Reference

Read these files when implementing to understand existing patterns:

| File | Purpose | When to Read |
|------|---------|-------------|
| `lib/services/whatsapp/whatsapp-api-client.ts` | Core API wrapper — never modify for modules | Always — understand available methods |
| `lib/services/admission/expo-whatsapp-service.ts` | Reference implementation | First time — copy this pattern |
| `app/api/admission/expos/wa-welcome/route.ts` | API route example | When creating your route |
| `app/api/webhooks/whatsapp/route.ts` | Webhook handler | If handling inbound replies |
| `lib/services/whatsapp/whatsapp-consent-service.ts` | Consent management | If building consent workflows |
| `lib/services/whatsapp/whatsapp-chat-service.ts` | Conversation management | If building chat features |
| `types/whatsapp.ts` | Type definitions | When working with WA types |

---

## Phone Number Formatting

All phone numbers sent to Meta must be in `91XXXXXXXXXX` format (India, no +, no spaces):

```
Input                    → Output
"9876543210"            → "919876543210"
"+919876543210"         → "919876543210"
"+91 98765 43210"       → "919876543210"
"09876543210"           → "919876543210"
"91-9876543210"         → "919876543210"
```

Validation: Indian mobile must be 10 digits starting with 6-9: `/^[6-9]\d{9}$/`

---

## Consent & Compliance (DPDPA)

Every module that sends WhatsApp messages MUST:

1. **Collect explicit opt-in** before sending any message
2. **Store consent metadata**: `wa_opt_in`, `wa_opt_in_at`, `wa_opt_in_source`
3. **Honor opt-out**: Check `wa_opt_in` before every send
4. **Handle STOP keyword**: Auto-revoke consent when user sends STOP/UNSUBSCRIBE
5. **Audit trail**: Log consent changes for compliance

Never send a message without checking consent first. The consent check goes inside your service, not the API route — defense in depth.

---

## Multi-Institution Support

The `wa_phone_numbers` table maps institutions to their WhatsApp phone numbers. For institution-specific credentials:

```typescript
// Use the factory method:
const client = await WhatsAppCloudAPIClient.forInstitution(institutionId);
await client.sendTemplateMessage(phone, templateName, 'en', components);

// Or use the singleton (falls back to env vars):
import { sendTemplateMessage } from '@/lib/services/whatsapp/whatsapp-api-client';
await sendTemplateMessage(phone, templateName, 'en', components);
```

Use the factory when institutions have different WABA accounts. Use the singleton when all institutions share one WABA.

---

## Message Flow Patterns

### Pattern A: Auto-Send on Entity Creation (Expo-style)
Best for: Welcome messages, confirmations, acknowledgments
```
Entity Created → Fire-and-forget API call → Template message → Log to queue
```

### Pattern B: Scheduled/Triggered Messages (Campaign-style)
Best for: Reminders, follow-ups, bulk notifications
```
Cron/Trigger → Fetch eligible entities → Batch send → Log results
```

### Pattern C: Interactive Conversations (Chat-style)
Best for: Support, counseling, inquiry handling
```
Template sent → User replies → Webhook receives → Route to counselor → Reply within 24hr window
```

Choose the pattern that fits your module's use case. Pattern A is the simplest and most common starting point.
