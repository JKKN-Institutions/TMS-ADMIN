-- =============================================================================
-- BYOW WhatsApp Database Schema
-- =============================================================================
-- Multi-tenant schema for tracking WhatsApp connections, groups, templates,
-- and message logs. Designed for Supabase with Row-Level Security (RLS).
--
-- Prerequisites:
-- - A 'members' or 'users' table with id, chapter_id columns
-- - A 'roles' table with id, name columns
-- - A 'user_roles' junction table linking users to roles
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. WhatsApp Connections Table
-- Tracks which chapters/tenants have connected their WhatsApp
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,

    -- Connection status
    status TEXT NOT NULL DEFAULT 'disconnected'
        CHECK (status IN ('disconnected', 'connecting', 'qr_ready', 'authenticated', 'ready')),

    -- Connected account info
    phone_number TEXT,
    push_name TEXT,

    -- Metadata
    connected_at TIMESTAMPTZ,
    connected_by UUID REFERENCES auth.users(id),
    disconnected_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Only one connection per chapter
    UNIQUE(chapter_id)
);

-- Enable RLS
ALTER TABLE whatsapp_connections ENABLE ROW LEVEL SECURITY;

-- Policy: Only Chair/Co-Chair can manage connections
CREATE POLICY "whatsapp_connections_manage" ON whatsapp_connections
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM members m
            JOIN user_roles ur ON m.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE m.id = auth.uid()
            AND m.chapter_id = whatsapp_connections.chapter_id
            AND r.name IN ('Chair', 'Co-Chair')
        )
    );

-- Updated_at trigger
CREATE TRIGGER whatsapp_connections_updated_at
    BEFORE UPDATE ON whatsapp_connections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- -----------------------------------------------------------------------------
-- 2. WhatsApp Groups Table
-- Cache of WhatsApp groups for the connected account
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,

    -- Group info
    jid TEXT NOT NULL,              -- WhatsApp Group JID (e.g., 120363374011459909@g.us)
    name TEXT NOT NULL,
    description TEXT,
    participant_count INTEGER,

    -- Sync metadata
    last_synced_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Unique JID per chapter
    UNIQUE(chapter_id, jid)
);

-- Enable RLS
ALTER TABLE whatsapp_groups ENABLE ROW LEVEL SECURITY;

-- Policy: View groups for your chapter (with appropriate role)
CREATE POLICY "whatsapp_groups_read" ON whatsapp_groups
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM members m
            JOIN user_roles ur ON m.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE m.id = auth.uid()
            AND m.chapter_id = whatsapp_groups.chapter_id
            AND r.name IN ('Chair', 'Co-Chair', 'EC Member')
        )
    );

-- Policy: Only Chair/Co-Chair can manage groups
CREATE POLICY "whatsapp_groups_manage" ON whatsapp_groups
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM members m
            JOIN user_roles ur ON m.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE m.id = auth.uid()
            AND m.chapter_id = whatsapp_groups.chapter_id
            AND r.name IN ('Chair', 'Co-Chair')
        )
    );

-- Updated_at trigger
CREATE TRIGGER whatsapp_groups_updated_at
    BEFORE UPDATE ON whatsapp_groups
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- -----------------------------------------------------------------------------
-- 3. WhatsApp Templates Table
-- Reusable message templates
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,

    -- Template content
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT,              -- e.g., 'meeting_reminder', 'event_invite', 'general'

    -- Variables for personalization (stored as JSON array)
    -- e.g., ['{{name}}', '{{date}}', '{{location}}']
    variables JSONB DEFAULT '[]'::JSONB,

    -- Usage tracking
    use_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMPTZ,

    -- Metadata
    created_by UUID REFERENCES auth.users(id),

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;

-- Policy: View templates for your chapter
CREATE POLICY "whatsapp_templates_read" ON whatsapp_templates
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM members m
            JOIN user_roles ur ON m.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE m.id = auth.uid()
            AND m.chapter_id = whatsapp_templates.chapter_id
            AND r.name IN ('Chair', 'Co-Chair', 'EC Member')
        )
    );

-- Policy: Chair/Co-Chair can manage templates
CREATE POLICY "whatsapp_templates_manage" ON whatsapp_templates
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM members m
            JOIN user_roles ur ON m.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE m.id = auth.uid()
            AND m.chapter_id = whatsapp_templates.chapter_id
            AND r.name IN ('Chair', 'Co-Chair')
        )
    );

-- Updated_at trigger
CREATE TRIGGER whatsapp_templates_updated_at
    BEFORE UPDATE ON whatsapp_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- -----------------------------------------------------------------------------
-- 4. WhatsApp Message Logs Table
-- Audit trail of all sent messages
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_message_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,

    -- Recipient info
    recipient_type TEXT NOT NULL CHECK (recipient_type IN ('individual', 'group', 'bulk')),
    recipient_id TEXT NOT NULL,     -- Phone number or group JID
    recipient_name TEXT,            -- Cached name for display

    -- Message content
    message_content TEXT NOT NULL,
    template_id UUID REFERENCES whatsapp_templates(id) ON DELETE SET NULL,

    -- Status
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
    error_message TEXT,

    -- WhatsApp message ID (for tracking delivery)
    whatsapp_message_id TEXT,

    -- Who sent it
    sent_by UUID NOT NULL REFERENCES auth.users(id),
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE whatsapp_message_logs ENABLE ROW LEVEL SECURITY;

-- Policy: View logs for your chapter
CREATE POLICY "whatsapp_message_logs_read" ON whatsapp_message_logs
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM members m
            JOIN user_roles ur ON m.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE m.id = auth.uid()
            AND m.chapter_id = whatsapp_message_logs.chapter_id
            AND r.name IN ('Chair', 'Co-Chair', 'EC Member')
        )
    );

-- Policy: Authorized users can insert logs
CREATE POLICY "whatsapp_message_logs_insert" ON whatsapp_message_logs
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM members m
            JOIN user_roles ur ON m.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE m.id = auth.uid()
            AND m.chapter_id = whatsapp_message_logs.chapter_id
            AND r.name IN ('Chair', 'Co-Chair', 'EC Member')
        )
    );

-- Indexes for common queries
CREATE INDEX idx_whatsapp_message_logs_chapter
    ON whatsapp_message_logs(chapter_id);
CREATE INDEX idx_whatsapp_message_logs_sent_at
    ON whatsapp_message_logs(sent_at DESC);
CREATE INDEX idx_whatsapp_message_logs_status
    ON whatsapp_message_logs(status);


-- -----------------------------------------------------------------------------
-- 5. Helper Function: Update updated_at timestamp
-- (Create if not exists)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';


-- -----------------------------------------------------------------------------
-- 6. Views for Common Queries
-- -----------------------------------------------------------------------------

-- View: Active WhatsApp connections with chapter info
CREATE OR REPLACE VIEW whatsapp_active_connections AS
SELECT
    wc.*,
    c.name as chapter_name
FROM whatsapp_connections wc
JOIN chapters c ON c.id = wc.chapter_id
WHERE wc.status = 'ready';

-- View: Message statistics per chapter
CREATE OR REPLACE VIEW whatsapp_message_stats AS
SELECT
    chapter_id,
    COUNT(*) as total_messages,
    COUNT(*) FILTER (WHERE status = 'sent') as sent_count,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
    COUNT(DISTINCT recipient_id) as unique_recipients,
    MAX(sent_at) as last_message_at
FROM whatsapp_message_logs
GROUP BY chapter_id;
