-- Provision a '🚀 Getting Started in Radius' starter board for every user.
-- Existing users are backfilled; new users get it via the handle_new_user trigger.

-- ── 1. Provision function ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.provision_starter_board(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $provision_starter_board$
DECLARE
  v_board_id      uuid := gen_random_uuid();
  v_col_todo      uuid := gen_random_uuid();
  v_col_progress  uuid := gen_random_uuid();
  v_col_done      uuid := gen_random_uuid();
  v_label_imp     uuid := gen_random_uuid();
  v_card_01      uuid := gen_random_uuid();
  v_card_02      uuid := gen_random_uuid();
  v_card_03      uuid := gen_random_uuid();
  v_card_04      uuid := gen_random_uuid();
  v_card_05      uuid := gen_random_uuid();
  v_card_06      uuid := gen_random_uuid();
  v_card_07      uuid := gen_random_uuid();
  v_card_08      uuid := gen_random_uuid();
  v_card_09      uuid := gen_random_uuid();
  v_card_10      uuid := gen_random_uuid();
  v_card_11      uuid := gen_random_uuid();
  v_card_12      uuid := gen_random_uuid();
  v_card_13      uuid := gen_random_uuid();
  v_card_14      uuid := gen_random_uuid();
  v_card_15      uuid := gen_random_uuid();
  v_card_16      uuid := gen_random_uuid();
  v_card_17      uuid := gen_random_uuid();
BEGIN
  -- Skip if user already has a starter board (idempotent)
  IF EXISTS (
    SELECT 1 FROM project_boards
    WHERE user_id = p_user_id
      AND title IN ('Getting Started in Radius', '🚀 Getting Started in Radius')
  ) THEN
    RETURN;
  END IF;

  INSERT INTO project_boards (id, user_id, title, description, is_archived, is_public)
  VALUES (
    v_board_id, p_user_id,
    '🚀 Getting Started in Radius',
    'Welcome to Radius! Here are the key pages and tools to know.',
    false, false
  );

  INSERT INTO board_columns (id, board_id, title, position, color, automations) VALUES
    (v_col_todo,     v_board_id, 'To Do',       0, '#6366f1', '[]'::jsonb),
    (v_col_progress, v_board_id, 'In Progress', 1, '#f59e0b', '[]'::jsonb),
    (v_col_done,     v_board_id, 'Done',        2, '#22c55e', '[]'::jsonb);

  INSERT INTO board_labels (id, board_id, name, color) VALUES
    (v_label_imp, v_board_id, 'Important', '#22c55e');

  INSERT INTO board_cards
    (id, board_id, column_id, title, description, position, priority, is_archived, is_complete)
  VALUES
    (v_card_01, v_board_id, v_col_todo, '📅 Event Page', '<p>Track whether each circle has submitted their meeting summary for the week — and stay on top of leaders who need a nudge.</p><p><strong>What you''ll see:</strong></p><ul><li><p><strong>Submission progress</strong> — a progress bar shows how many leaders are caught up vs. behind</p></li><li><p><strong>Awaiting Submission</strong> — lists leaders with their meeting times, flagged red if overdue</p></li><li><p><strong>Send Reminder</strong> — nudge late leaders with one click</p></li><li><p><strong>AI Weekly Summary</strong> — generate a leadership overview from all submitted summaries</p></li></ul><p>Filter by campus, ACPD, or status. Hit "Sync Now" to pull the latest data from CCB.</p>', 0, 'medium', false, false),
    (v_card_02, v_board_id, v_col_todo, '🤝 Connection Tracker', '<p>Monitor whether each circle leader has received a touchpoint from their ACPD during the selected period — and ensure no one falls through the cracks.</p><p><strong>What you''ll see:</strong></p><ul><li><p><strong>Coverage progress</strong> — percentage of leaders who have been contacted this period</p></li><li><p><strong>Overdue flags</strong> — "0/1: overdue" in orange highlights who needs immediate attention</p></li><li><p><strong>ACPD breakdown</strong> — filter by coach to see their individual coverage</p></li><li><p><strong>Interaction types</strong> — calls, texts, meetings, and emails all count as touchpoints</p></li></ul><p>Use this to hold your team accountable for consistent, proactive leader care.</p>', 1, 'medium', false, false),
    (v_card_03, v_board_id, v_col_todo, '📊 Circle Reporting', '<p>Analytics dashboard for circle attendance, compliance, and trends across your campus.</p><p><strong>What you''ll find:</strong></p><ul><li><p><strong>Key metrics</strong> — total attendance, average circle size, compliance rate, and circles that didn''t meet</p></li><li><p><strong>Trend charts</strong> — attendance, compliance, and meeting frequency over time</p></li><li><p><strong>Segment breakdown</strong> — filter by campus, circle type, or ACPD to see who''s thriving vs. struggling</p></li><li><p><strong>Gap reasons</strong> — understand why circles didn''t meet (vacation, illness, holiday, etc.)</p></li></ul><p>Drill down to spot which leaders, campuses, or circle types need the most attention.</p>', 2, 'medium', false, false),
    (v_card_04, v_board_id, v_col_todo, '🔍 Search', '<p>Global search to instantly find leaders, boards, and cards anywhere in Radius.</p><p><strong>What you can search:</strong></p><ul><li><p><strong>Leaders</strong> — by first or last name; jump straight to a leader''s profile</p></li><li><p><strong>Boards</strong> — by board title or topic; quickly jump to any kanban board</p></li><li><p><strong>Cards</strong> — by title or description; useful when you remember a task but can''t recall which board it''s on</p></li></ul><p>Click the search box at the top of the Boards page, or press <strong>⌘K</strong> to open it from anywhere in the app.</p>', 3, 'medium', false, false),
    (v_card_05, v_board_id, v_col_todo, '☀️ Today Page', '<p>Your daily command center — see your priorities, tasks, and schedule all in one place.</p><p><strong>What''s on this page:</strong></p><ul><li><p><strong>Big 3</strong> — your top 3 priorities for the week; check them off as you go</p></li><li><p><strong>Today''s Tasks</strong> — all cards and action items due today, across every board</p></li><li><p><strong>Calendar events</strong> — today''s schedule synced from your connected calendar</p></li><li><p><strong>Outstanding follow-ups</strong> — leaders who need a touchpoint or a nudge</p></li></ul><p>Start every morning here before opening anything else.</p>', 4, 'medium', false, false),
    (v_card_06, v_board_id, v_col_todo, '📋 Boards', '<p>Organize your work using kanban boards and checklists — track everything from follow-ups to leader development tasks.</p><p><strong>Inside a board:</strong></p><ul><li><p><strong>Multiple views</strong> — Board (kanban), List, Calendar, and Notes</p></li><li><p><strong>Rich cards</strong> — labels, priorities, due dates, assignments, checklists, and comments</p></li><li><p><strong>Focus mode</strong> — spotlight only the cards that matter to you today</p></li><li><p><strong>Column automations</strong> — automatically move cards when they''re completed, assigned, or due</p></li></ul><p>Use boards for: follow-up tracking, onboarding workflows, prayer request queues, leader development plans, and more. Hit "+ New Board" to create one.</p>', 5, 'medium', false, false),
    (v_card_07, v_board_id, v_col_todo, '📓 Notebook', '<p>Shared workspace for meeting notes, agendas, and ideas — organized by folder and linked to cards, boards, and leaders.</p><p><strong>How it''s organized:</strong></p><ul><li><p><strong>Folders</strong> — group pages by team, topic, or season (e.g., ACPD, Teaching Notes, Journals)</p></li><li><p><strong>Pages</strong> — individual notes within a folder, with timestamps and linked item counts</p></li><li><p><strong>Linked items</strong> — attach cards, boards, or leader profiles directly to any page</p></li></ul><p>Think of it as a shared wiki — a single source of truth for coaching notes, meeting agendas, circle visit summaries, and team insights. Search across all pages instantly.</p>', 6, 'medium', false, false),
    (v_card_08, v_board_id, v_col_todo, '👤 Leader Profile', '<p>Complete view of a circle leader — contact info, circle details, attendance trends, health score, and quick actions all in one place.</p><p><strong>Profile tabs:</strong></p><ul><li><p><strong>Profile</strong> — overview, contact info, and attendance analytics</p></li><li><p><strong>Notes</strong> — meeting notes, coaching observations, and development plans</p></li><li><p><strong>Messaging</strong> — conversation history with the leader</p></li><li><p><strong>Scorecard</strong> — development ratings across Reach, Connect, Disciple, and Develop</p></li><li><p><strong>Snapshot</strong> — quick view of key metrics and current status</p></li><li><p><strong>Care</strong> — follow-up tasks and reminders</p></li></ul><p>Click any leader''s name from the Circle List, Dashboard, or Search to open their profile.</p>', 7, 'medium', false, false),
    (v_card_09, v_board_id, v_col_todo, '🙏 Prayer', '<p>Centralized prayer tracker for the leadership team — capture, organize, and follow up on prayer needs across your community.</p><p><strong>Features:</strong></p><ul><li><p><strong>Add requests</strong> — log prayer needs for circle leaders or the broader community</p></li><li><p><strong>Filter and search</strong> — by campus, ACPD, date, or keyword</p></li><li><p><strong>Mark as answered</strong> — close requests when they''re resolved</p></li><li><p><strong>Shared list</strong> — the whole team sees the same requests, so nothing gets prayed for in isolation</p></li></ul><p>The tagline says it all: <em>Lift every concern, blessing, and need.</em></p>', 8, 'medium', false, false),
    (v_card_10, v_board_id, v_col_todo, '🗺️ Circle List', '<p>Searchable directory of all active circles — designed to help people find and join a group that fits their life.</p><p><strong>Filter options:</strong></p><ul><li><p><strong>Campus</strong> — narrow to a specific location</p></li><li><p><strong>Circle Type</strong> — Men''s, Women''s, Couples, Young Adults, etc.</p></li><li><p><strong>Day and Time of Day</strong> — morning, afternoon, or evening</p></li><li><p><strong>Status and ACPD</strong> — advanced filters for admin use</p></li></ul><p>Each listing shows the leader, meeting schedule, location, and a sign-up link. Share this page with people looking to find their group.</p>', 9, 'medium', false, false),
    (v_card_11, v_board_id, v_col_todo, '💬 Bulk Messaging', '<p>Send personalized messages to multiple circle leaders at once — with filters, templates, and merge fields.</p><p><strong>How it works:</strong></p><ul><li><p><strong>Build your list</strong> — filter by status, campus, circle type, meeting day, or ACPD</p></li><li><p><strong>Compose your message</strong> — use merge fields like <code>{{first_name}}</code> for personalization</p></li><li><p><strong>Choose a channel</strong> — send via SMS or email</p></li><li><p><strong>Review and send</strong> — preview before it goes out</p></li></ul><p>Great for reminders, check-ins, announcements, and personalized outreach — without copy-pasting one by one.</p>', 10, 'medium', false, false),
    (v_card_12, v_board_id, v_col_todo, '🔎 Person Lookup', '<p>Find anyone in Church Community Builder (CCB) instantly — then text, call, email, or take action in one click.</p><p><strong>Search by:</strong></p><ul><li><p><strong>Name</strong> — first name, last name, or full name</p></li><li><p><strong>Phone number</strong> — find someone by their digits</p></li></ul><p>Results pull directly from CCB — the most current source of truth for your church. Each result card shows name, phone, email, and a CCB profile link. Quick-action buttons let you message, call, or add the person to a board immediately.</p>', 11, 'medium', false, false),
    (v_card_13, v_board_id, v_col_todo, '📥 Import a Circle', '<p>Sync a circle from Church Community Builder (CCB) into Radius — with a full review step before anything is imported.</p><p><strong>How to import:</strong></p><ol><li><p>Find the CCB Group ID in the group''s URL (e.g., <code>group_detail.php?group_id=3947</code>)</p></li><li><p>Paste the ID into the input field and click "Look Up"</p></li><li><p>Review the circle details — name, type, campus, schedule, and leader info</p></li><li><p>Assign an ACPD</p></li><li><p>Click Import — the circle and leader appear in Radius immediately</p></li></ol><p>Nothing is imported until you explicitly confirm, so you can review every detail before committing.</p>', 12, 'medium', false, false),
    (v_card_14, v_board_id, v_col_todo, '⚡ Mass Update', '<p>Bulk-update circle information across multiple leaders at once — useful for transfers, reorganizations, or large-scale data corrections.</p><p><strong>Fields you can update:</strong></p><ul><li><p>Campus, ACPD, Frequency, Circle Type, and email reminder settings</p></li></ul><p><strong>Workflow:</strong></p><ol><li><p><strong>Filter leaders</strong> — by ACPD, campus, or status</p></li><li><p><strong>Load leaders</strong> — see a count of how many match</p></li><li><p><strong>Choose what to update</strong> — select the field and new value</p></li><li><p><strong>Review the list</strong> — toggle off any leaders you want to exclude</p></li><li><p><strong>Apply</strong> — changes go live across all selected leaders instantly</p></li></ol>', 13, 'medium', false, false),
    (v_card_15, v_board_id, v_col_todo, '🗑️ CCB Event Management', '<p>Admin tool to review and selectively delete circle event occurrences in CCB — most useful for off-boarding circles or fixing duplicate and outdated events.</p><p><strong>Key principle:</strong> Radius only deletes individual event occurrences, never the full recurring series. Always preview before confirming.</p><p><strong>Workflow:</strong></p><ol><li><p><strong>Filter circles</strong> — by ACPD, campus, or status</p></li><li><p><strong>Set a date range</strong> — select which occurrences to review</p></li><li><p><strong>Preview</strong> — see exactly which events will be affected</p></li><li><p><strong>Confirm</strong> — only proceed once you''ve reviewed the list</p></li></ol><p>This is a destructive, admin-only operation. Use with care.</p>', 14, 'medium', false, false),
    (v_card_16, v_board_id, v_col_todo, '📱 Add Radius to Your Phone', '<p>Install Radius as an app on your iPhone home screen — no App Store needed. Radius is a Progressive Web App (PWA).</p><p><strong>How to install on iPhone (Safari only):</strong></p><ol><li><p>Open <strong>Safari</strong> and navigate to <strong>vccradius.netlify.app</strong></p></li><li><p>Sign in with your magic link email</p></li><li><p>Tap the <strong>Share icon</strong> (square with an arrow pointing up) at the bottom of Safari</p></li><li><p>Scroll down and tap <strong>"Add to Home Screen"</strong></p></li><li><p>Name it <strong>Radius</strong> and tap <strong>Add</strong></p></li></ol><p>It will appear on your home screen like a native app and works offline for key features. Note: this only works in Safari — not Chrome or Firefox on iPhone.</p>', 15, 'medium', false, false),
    (v_card_17, v_board_id, v_col_todo, '📧 Daily Email', '<p>Get a personalized daily digest of your leaders and tasks delivered straight to your inbox — a morning briefing before you open the app.</p><p><strong>What''s included:</strong></p><ul><li><p>Leaders with outstanding follow-ups</p></li><li><p>Cards and tasks due today</p></li><li><p>Circles that haven''t submitted summaries</p></li><li><p>Key metrics for your campus</p></li></ul><p><strong>Delivery:</strong> Every 12 hours — 4:00 AM and 4:00 PM CST.</p><p>Toggle on or off anytime from your profile settings. When enabled, you''ll never need to log in just to see what''s on your plate.</p>', 16, 'medium', false, false);

  INSERT INTO card_label_assignments (card_id, label_id) VALUES
    (v_card_01, v_label_imp),
    (v_card_02, v_label_imp),
    (v_card_03, v_label_imp),
    (v_card_04, v_label_imp);

END;
$provision_starter_board$;


-- ── 2. Update handle_new_user to auto-provision on signup ──────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'name');
  BEGIN
    PERFORM public.provision_starter_board(new.id);
  EXCEPTION WHEN OTHERS THEN
    NULL;  -- don't block user creation if board provisioning fails
  END;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── 3. Backfill all existing users ──────────────────────────────────────────
DO $$
DECLARE
  v_uid uuid;
BEGIN
  FOR v_uid IN SELECT id FROM public.users LOOP
    PERFORM public.provision_starter_board(v_uid);
  END LOOP;
END;
$$;
