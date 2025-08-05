# CCB Event Notes for Group

A React + TypeScript page for fetching event notes from the CCB (Church Community Builder) API for a specific group within a date range.

## Features

- Fetches event profiles from CCB API using HTTP Basic Auth
- Filters events by group ID and date range
- Retrieves detailed event information including setup notes and leader notes
- Displays results in chronological order
- Handles pagination (up to 5000 events with 100 per page)
- Comprehensive error handling with user-friendly messages
- Loading indicators during API calls
- Responsive design for mobile and desktop

## Usage

1. Navigate to `/func/event-notes` in your Radius app
2. Enter the required information:
   - **Group ID**: The numeric ID of the CCB group
   - **Start Date**: Beginning of date range (YYYY-MM-DD format)
   - **End Date**: End of date range (YYYY-MM-DD format)
3. Click "Fetch Event Notes" to retrieve data
4. View results with event names, dates, and associated notes

## API Integration

The tool integrates with the CCB API using two endpoints:

### 1. Event Profiles (`srv=event_profiles`)
- Lists events with basic information
- Supports pagination with `per_page=100` and `page=N`
- Filters by `modified_since` date
- Returns event IDs, names, dates, and group associations

### 2. Event Profile Details (`srv=event_profile&id=...`)
- Fetches complete event details for each event ID
- Includes setup notes and leader notes
- Called individually for each matching event

## Authentication

The tool uses HTTP Basic Authentication with CCB API credentials:
- Username: `circlesreportingapi`
- Password: `curho8-gyxceQ-mymqyv`

**⚠️ Security Note**: These credentials are currently hard-coded for development. In production, move them to environment variables:

```env
CCB_API_USERNAME=circlesreportingapi
CCB_API_PASSWORD=curho8-gyxceQ-mymqyv
CCB_API_BASE_URL=https://valleycreekchurch.ccbchurch.com/api.php
```

## File Structure

```
app/func/event-notes/
├── page.tsx              # Main page component
hooks/
└── useEventNotesForGroup.ts  # Custom hook for API calls
lib/
└── ccb-types.ts          # TypeScript interfaces
```

## Technical Details

### Data Flow
1. User submits form with group ID and date range
2. `useEventNotesForGroup` hook is triggered
3. Hook calls `srv=event_profiles` with pagination
4. Results are filtered by group ID and date range
5. For each matching event, calls `srv=event_profile&id=...`
6. Notes are extracted and formatted
7. Results are sorted chronologically and displayed

### Error Handling
- Network errors (connection issues, timeouts)
- Authentication errors (invalid credentials)
- XML parsing errors (malformed responses)
- Rate limiting (429 responses)
- Individual event fetch failures (continues with other events)

### TypeScript Types
```typescript
interface EventNote {
  eventId: string;
  eventName: string;
  eventDate: string;
  notes: string[];
  setupNotes?: string;
  leaderNotes?: string;
}
```

## Dependencies

- React 18+
- TypeScript
- Next.js 14+
- Built-in browser APIs:
  - `fetch()` for HTTP requests
  - `DOMParser` for XML parsing
  - `btoa()` for Base64 encoding

No additional external dependencies required.

## Limitations

- CCB API rate limiting may affect performance with large date ranges
- XML parsing is simplified and may not handle all edge cases
- Pagination safety limit of 50 pages (5000 events max)
- Hard-coded credentials (should be environment variables)

## Future Enhancements

- [ ] Environment variable configuration
- [ ] Export functionality (CSV, PDF)
- [ ] Date range presets (last week, month, etc.)
- [ ] Group search/autocomplete
- [ ] Bulk group processing
- [ ] Enhanced error recovery and retry logic
- [ ] Caching for improved performance
