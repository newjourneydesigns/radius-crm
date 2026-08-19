# CCB Event Notes Integration

This document describes the Church Community Builder (CCB) API integration for viewing event notes within Circle Leader profiles.

## Overview

The CCB Event Notes feature allows Circle Leaders to view historical event notes for their groups directly within the Radius application. This integration connects to the CCB API to fetch event data and display it in an easy-to-read format.

## Setup

### 1. Database Migration

First, apply the database migration to add the CCB Group ID field:

```sql
-- Run this migration in your Supabase SQL editor
ALTER TABLE circle_leaders 
ADD COLUMN IF NOT EXISTS ccb_group_id TEXT;

COMMENT ON COLUMN circle_leaders.ccb_group_id IS 'CCB (Church Community Builder) Group ID for API integration';
```

### 2. Environment Variables

Add the following environment variables to your `.env.local` file:

```bash
# CCB API Configuration
CCB_BASE_URL=https://valleycreekchurch.ccbchurch.com/api.php
CCB_API_USER=circlesreportingapi
CCB_API_PASSWORD=your_ccb_api_password
```

### 3. CCB Group ID Configuration

For each Circle Leader that should have access to event notes:

1. Go to the Circle Leader's profile page
2. Click "Edit" on the Circle Information section
3. Enter the CCB Group ID in the "CCB Group ID" field
4. Save the changes

## Features

### Date Range Selection
- Users can select a start and end date to filter event notes
- Default range is set to the last 30 days
- Supports keyboard shortcuts (Ctrl/Cmd + Enter to search)

### Event Notes Display
- Shows event name, date, and notes content
- Displays attendee count when available
- Formats dates in a readable format
- Handles empty states gracefully

### Error Handling
- Clear error messages for API failures
- Warning when CCB Group ID is not configured
- Validation for date ranges

## API Endpoints

### POST /api/ccb/event-notes

Fetches event notes for a specific group and date range.

**Request Body:**
```json
{
  "groupId": "string",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD"
}
```

**Response:**
```json
{
  "success": true,
  "groupId": "string",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "eventNotes": [
    {
      "eventId": "string",
      "eventName": "string",
      "eventDate": "ISO date string",
      "notes": "string",
      "attendeeCount": number
    }
  ],
  "totalEvents": number
}
```

### GET /api/ccb/event-notes (Development)

For development and testing, the API also supports GET requests with query parameters. This returns mock data when CCB credentials are not configured.

### POST /api/ccb/group-search

Searches all CCB groups by name. Consumed by the Valley Creek Toolkit (vcpulse), which forwards its signed-in user's Supabase bearer token unchanged — the same auth gate as `/api/ccb/person-search` (401 when not signed in).

Unlike the other `/api/ccb/*` endpoints, **this never calls CCB**. It reads the `ccb_group_cache` table, which a scheduled sweep rebuilds nightly (see below), so it is fast, costs zero CCB budget, and keeps answering when CCB is down. `syncedAt` tells the caller how fresh the cache is.

**Request Body:**
```json
{ "query": "stm leader", "includeInactive": false }
```

- `query` — required, trimmed, minimum 2 characters. Under the floor the endpoint answers `success: true, data: []` (not an error).
- `includeInactive` — optional, default `false`. When false, groups marked inactive in CCB are excluded.

Matching is case-insensitive and every whitespace-separated word must appear somewhere in the group name (AND of substrings): `stm leader` finds "STM Leaders – Denton" and "Leaders of STM Teams" but not "STM Kids".

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "1234",
      "name": "Anthem STM Leaders",
      "campus": "Lewisville",
      "groupType": "Serve Team",
      "mainLeader": "Jane Doe",
      "memberCount": null,
      "inactive": false
    }
  ],
  "total": 37,
  "syncedAt": "2026-08-19T08:00:12Z"
}
```

- `data` — best 25 matches: exact name match first, then name-starts-with, then alphabetical. `campus`, `groupType`, `mainLeader`, `memberCount` are nullable. `memberCount` is null in practice: `group_profiles` with `include_participants=false` carries no membership count.
- `total` — the uncapped match count.
- `syncedAt` — when the cache last finished a COMPLETE sweep; `null` if it never has.

Failures: missing/invalid auth → 401; anything else → `success: false` with `error`/`details`, same shapes as the sibling endpoints.

### POST /api/ccb/sync-group-cache (cron / manual)

Rebuilds the `ccb_group_cache` table by paging through CCB v1 `group_profiles` with `include_participants=false` (100 groups per page ⇒ ceil(N/100) CCB calls, through the shared daily budget guard). Called nightly at 8:00 UTC by the Netlify scheduled function `netlify/functions/sync-group-cache.ts`.

Auth is `Authorization: Bearer ${CRON_SECRET}` (fail-closed), so a manual run — e.g. the first cache fill — is:

```bash
curl -X POST "$APP_URL/api/ccb/sync-group-cache" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Sweep guarantees:

- Rows are upserted with the sweep's start timestamp; rows CCB no longer returns are deleted **only after a complete sweep**. A partial sweep (budget guard tripped, CCB error) never deletes anything — yesterday's cache keeps serving.
- If the daily CCB budget is already spent, the sweep skips (`complete: false`) and the search endpoint's `syncedAt` truthfully reports the cache's age.
- `group_profiles` **does** return inactive groups; they are cached with `inactive: true` so `includeInactive` works.

Verification: `npm run verify:group-search` asserts the matching/ranking contract and the `group_profiles` page parser (pure logic, no network/DB).

## CCB API Integration Details

The integration uses the following CCB API endpoints:

1. **event_profiles** - Primary endpoint for fetching events with notes
2. **attendance_profiles** - Alternative endpoint for group-specific attendance data
3. **group_participants** - For validating group access permissions (future enhancement)

### API Parameters

- `srv`: Service endpoint name (e.g., 'event_profiles')
- `modified_since`: Start date for filtering events
- `page`: Page number for pagination
- `per_page`: Number of results per page (default: 100)
- `include_notes`: Boolean to include notes in response
- `start_date` / `end_date`: Date range filters

### Authentication

The integration uses HTTP Basic Authentication with the configured CCB API credentials.

## Security Considerations

- CCB API credentials are stored securely as environment variables
- Circle Leaders can only access event notes for their assigned group
- Rate limiting is handled client-side (60 calls per hour recommended)
- No sensitive CCB data is cached in the browser

## Troubleshooting

### "No CCB Group ID configured" Warning
- This appears when a Circle Leader doesn't have a CCB Group ID set
- Edit the Circle Leader profile and add the appropriate CCB Group ID

### "CCB API not configured" Error
- Check that all required environment variables are set
- Verify CCB API credentials are correct
- Ensure the CCB_BASE_URL is accessible from your server

### "Failed to fetch event notes" Error
- Check CCB API credentials
- Verify the Group ID exists in CCB
- Ensure the date range contains events with notes
- Check server logs for detailed error messages

### No Events Found
- Verify the date range includes periods when events occurred
- Check that events have notes recorded in CCB
- Confirm the Group ID is correct

## Development Notes

- The component gracefully handles missing CCB configuration
- Mock data is provided for development when CCB credentials are not available
- XML parsing is currently done with regex (consider using a proper XML parser for production)
- The integration supports pagination for large result sets

## Future Enhancements

- Add group participant validation
- Implement caching for frequently accessed event notes
- Add export functionality for event notes
- Support for filtering by event type
- Enhanced error reporting and logging
- Real-time sync indicators
