-- Admin role model (docs/ADMIN_DATA_BOUNDARIES.md). Enum changes live in their own migration because a
-- newly added enum value can't be used in the transaction that adds it.
-- Existing 'admin' grants become 'super_admin' (rename keeps every row).
alter type public.app_role rename value 'admin' to 'super_admin';
alter type public.app_role add value if not exists 'support_admin';
alter type public.app_role add value if not exists 'analyst';

-- Report lifecycle: Open → Investigating (in_review) → Action taken (actioned) / Dismissed / Resolved;
-- Escalated stays for legal/compliance hand-offs.
alter type public.report_status add value if not exists 'resolved';
