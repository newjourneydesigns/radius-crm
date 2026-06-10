import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import 'dotenv/config';

(async () => {
  const sub = process.env.CCB_SUBDOMAIN;
  const u = process.env.CCB_API_USERNAME;
  const p = process.env.CCB_API_PASSWORD;
  const groupId = process.argv[2] || '3850';
  const res = await axios.get(`https://${sub}.ccbchurch.com/api.php`, {
    params: { srv: 'group_profile_from_id', id: groupId, include_participants: 'false' },
    auth: { username: u!, password: p! },
  });
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const data = parser.parse(res.data);
  const g = data?.ccb_api?.response?.groups?.group;
  console.log('top-level keys:', Object.keys(g || {}).join(', '));
  console.log('calendar_feed:', JSON.stringify(g?.calendar_feed));
  console.log('meeting_day:', JSON.stringify(g?.meeting_day));
  console.log('meeting_time:', JSON.stringify(g?.meeting_time));
  console.log('full group object:', JSON.stringify(g, null, 2));

  // Try fetching the iCal feed if we got a URL
  const feedUrl = (typeof g?.calendar_feed === 'string' ? g.calendar_feed : g?.calendar_feed?.['#text']) || '';
  if (feedUrl) {
    console.log('Fetching iCal feed...');
    try {
      const httpsUrl = feedUrl.replace(/^webcal:/, 'https:');
      console.log('Fetching:', httpsUrl);
      const ical = await axios.get(httpsUrl, { auth: { username: u!, password: p! } });
      console.log('iCal status:', ical.status, 'len:', ical.data?.length);
      console.log('iCal sample (first 1500 chars):');
      console.log(typeof ical.data === 'string' ? ical.data.slice(0, 1500) : JSON.stringify(ical.data).slice(0, 1500));
    } catch (e: any) {
      console.log('iCal fetch error:', e?.response?.status, e?.message);
    }
  }
})();
