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
