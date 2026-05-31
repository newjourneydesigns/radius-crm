import { readFileSync } from 'node:fs';
import { XMLParser } from 'fast-xml-parser';

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const BASE = `https://${env.CCB_SUBDOMAIN}.ccbchurch.com/api.php`;
const AUTH = 'Basic ' + Buffer.from(`${env.CCB_API_USERNAME}:${env.CCB_API_PASSWORD}`).toString('base64');
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

const EVENT_ID = '15931';
const OCC = '2026-05-20 19:00:00';
const ATTENDEES = ['106562', '9', '48191', '103400']; // Ousman, Trip, Josiah, Isaac
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function getProfile() {
  const url = `${BASE}?srv=attendance_profile&id=${EVENT_ID}&occurrence=2026-05-20`;
  const res = await fetch(url, { headers: { Authorization: AUTH } });
  const xml = parser.parse(await res.text());
  return xml?.ccb_api?.response?.events?.event ?? {};
}

// 1) Read current state so we preserve notes verbatim (CCB overwrites the occurrence).
const before = await getProfile();
const notes = typeof before.notes === 'string' ? before.notes : '';
const topic = typeof before.topic === 'string' ? before.topic : '';
const prayer = typeof before.prayer_requests === 'string' ? before.prayer_requests : '';
const info = typeof before.info === 'string' ? before.info : '';
console.log('BEFORE  head_count=%s  did_not_meet=%s  attendees=%s', before.head_count, before.did_not_meet, JSON.stringify(before.attendees));
console.log('NOTES   :', JSON.stringify(notes).slice(0, 160));

// 2) Build the same XML the fixed submit route would send (4 named attendees,
//    head_count 0, notes preserved), but with email_notification=none.
const attendeesXml = ATTENDEES.map((id) => `    <attendee id="${esc(id)}"></attendee>`).join('\n');
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<events>
  <event id="${EVENT_ID}" occurrence="${esc(OCC)}">
    <did_not_meet>false</did_not_meet>
    <head_count>0</head_count>
    <attendees>
${attendeesXml}
    </attendees>
    <topic>${esc(topic)}</topic>
    <notes>${esc(notes)}</notes>
    <prayer_requests>${esc(prayer)}</prayer_requests>
    <info>${esc(info)}</info>
    <email_notification>none</email_notification>
  </event>
</events>`;

const form = new FormData();
form.append('filedata', new Blob([xml], { type: 'text/xml' }), 'attendance.xml');
const post = await fetch(`${BASE}?srv=create_event_attendance`, { method: 'POST', headers: { Authorization: AUTH }, body: form });
const postXml = parser.parse(await post.text());
const ccbErr = postXml?.ccb_api?.response?.errors?.error;
if (ccbErr) { console.error('CCB ERROR:', JSON.stringify(ccbErr)); process.exit(1); }
console.log('\nPOST ok (status %s)', post.status);

// 3) Verify.
const after = await getProfile();
const att = after.attendees?.attendee;
const list = Array.isArray(att) ? att : att ? [att] : [];
console.log('\nAFTER   head_count=%s  did_not_meet=%s', after.head_count, after.did_not_meet);
console.log('RECORDED ATTENDEES (%s):', list.length);
for (const a of list) console.log('  -', a['@_id'], a.first_name, a.last_name);
console.log('NOTES PRESERVED:', typeof after.notes === 'string' && after.notes === notes ? 'yes' : 'CHANGED');
