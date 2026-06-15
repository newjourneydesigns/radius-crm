# Inbox Notifications & ACPD Messaging — Deploy Runbook

Covers the user inbox (`/inbox`), ACPD team messaging (`/messages`), and Web
Push for both. Follow this when setting up a fresh environment or re-deploying.

## 1. Migrations (run in order)

In the Supabase SQL editor, run each file's full contents in order:

1. `supabase/migrations/20260615120000_acpd_messaging.sql` — messaging tables + RLS
2. `supabase/migrations/20260615130000_notifications_foundation.sql` — `notifications`, prefs, `create_notification`, RLS, realtime
3. `supabase/migrations/20260615140000_notification_triggers.sql` — producer triggers (assignments, comments, board/notebook shares, messages)
4. `supabase/migrations/20260615150000_notification_push_dispatch.sql` — `push_sent_at` column + push-aware `create_notification`

All are idempotent (`CREATE OR REPLACE` / `IF NOT EXISTS`); re-running is safe.

Verify:

```sql
select
  (select count(*) from pg_trigger where tgname like 'trg_notify%') as trigger_count,   -- expect 5
  exists (select 1 from information_schema.columns
          where table_schema='public' and table_name='notifications'
          and column_name='push_sent_at') as has_push_sent_at,                          -- expect true
  (select count(*) from pg_proc where proname in
     ('create_notification','notif_pref_enabled','notify_on_card_assignment',
      'notify_on_card_comment','notify_on_board_share','notify_on_notebook_share',
      'notify_on_acpd_message')) as fn_count;                                           -- expect 7
```

## 2. Netlify redeploy

Registers two scheduled functions:

- `notification-daily-alerts` — daily birthday / follow-up alerts
- `notification-dispatch-push` — every-5-min **backstop** for push (see below)

Required env vars (most already exist for push reminders):

- `CRON_SECRET` — auth for the scheduled functions **and** the push webhook
- `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_VAPID_SUBJECT`

## 3. Database Webhook — instant push (do this once)

Push delivery is **event-driven**: a Supabase Database Webhook fires the moment
a notification row is inserted, so there is no idle polling load. The
every-5-min cron is only a backstop for missed webhooks.

Supabase Dashboard → **Database → Webhooks → Create a new hook**:

| Field | Value |
|---|---|
| Name | `notifications_push` |
| Table | `public.notifications` |
| Events | **Insert** only |
| Type | HTTP Request |
| Method | **POST** |
| URL | `https://<production-domain>/api/notifications/dispatch-push` |
| HTTP Headers | `Authorization: Bearer <CRON_SECRET value>` |

Use the **main RADIUS** production domain (`NEXT_PUBLIC_APP_URL`), not the
toolkit host.

### How it fits together

- New notification row → webhook POSTs `{ record: { id } }` → endpoint pushes
  that single row instantly.
- Each row is "claimed" with a conditional `push_sent_at` update before
  sending, so the webhook and the cron backstop can never double-send.
- **Team messages** push instantly from the message API and are stamped
  `push_sent_at` at insert, so the dispatcher skips them.

## 4. Smoke test

- **Messages** (`/messages`): post in the ACPD Team channel, start a DM,
  forward a message. Confirm the unread badge updates and a push lands on a
  second device.
- **Inbox** (`/inbox`): assign a card / comment / share a board or notebook to
  another user → it appears in their inbox and pushes within ~1s. Try filter,
  mark read/unread, archive, delete, and the per-type settings toggles.
- **Daily alerts** (on-demand): `POST /api/notifications/daily-alerts` with
  header `Authorization: Bearer <CRON_SECRET>`.
