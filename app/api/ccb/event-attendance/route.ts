import { NextResponse } from 'next/server';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';

export const dynamic = 'force-dynamic';

// Simple in-memory rate limiter
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 10; // 10 requests per minute per user

// Response cache to minimize CCB API calls
const responseCache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const userLimit = rateLimitMap.get(userId);

  if (!userLimit || now > userLimit.resetAt) {
    // Reset window
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (userLimit.count >= RATE_LIMIT_MAX) {
    return false;
  }

  userLimit.count++;
  return true;
}

function getCachedResponse(cacheKey: string): any | null {
  const cached = responseCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }
  responseCache.delete(cacheKey);
  return null;
}

function setCachedResponse(cacheKey: string, data: any): void {
  responseCache.set(cacheKey, {
    data,
    expiresAt: Date.now() + CACHE_TTL,
  });
}

export async function POST(request: Request) {
  try {
    // Parse request body
    const body = await request.json();
    const { date, groupName } = body;

    // Validate required fields
    if (!date || !groupName) {
      return NextResponse.json(
        { error: 'Missing required fields: date and groupName are required' },
        { status: 400 }
      );
    }

    // Simple authentication check - in production, verify user session
    // For now, we'll use IP or a simple identifier
    const userId = request.headers.get('x-forwarded-for') || 'anonymous';

    // Check rate limit
    if (!checkRateLimit(userId)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again in a minute.' },
        { status: 429 }
      );
    }

    // Check cache
    const cacheKey = `${groupName}:${date}`;
    const cached = getCachedResponse(cacheKey);
    if (cached) {
      console.log(`📦 Returning cached response for ${cacheKey}`);
      return NextResponse.json({ ...cached, cached: true });
    }

    // Create CCB client (credentials are server-side only)
    const ccbClient = createCCBClient();

    if (process.env.NODE_ENV === 'development') {
      console.log(`🔍 Fetching CCB events for group "${groupName}" on ${date}`);
    } else {
      console.log(`🔍 Fetching CCB events on ${date}`);
    }

    // OPTIMIZED: Use fast search method (10-20x faster!)
    const events = await ccbClient.searchEventsByDateAndName(
      groupName,
      date,
      date,
      {
        includeAttendees: true,
      }
    );

    console.log(`✅ Found ${events.length} events`);

    // Format the response
    const formattedEvents = events.map((event) => {
      const attendance = event.attendance;
      
      return {
        eventId: event.eventId,
        title: event.title,
        date: event.occurDate,
        link: event.link,
        notes: attendance?.notes || null,
        prayerRequests: attendance?.prayerRequests || null,
        topic: attendance?.topic || null,
        headCount: attendance?.headCount || null,
        didNotMeet: attendance?.didNotMeet || false,
        attendees: attendance?.attendees?.map(a => ({
          id: a.id,
          name: a.name,
          status: a.status,
        })) || [],
      };
    });

    const response = {
      success: true,
      data: formattedEvents,
      count: formattedEvents.length,
    };

    // Cache the response
    setCachedResponse(cacheKey, response);

    return NextResponse.json(response);

  } catch (error: any) {
    const message = (error?.message || '').toString();
    const requestId = Math.random().toString(36).slice(2, 10);

    const upstreamStatusFromError = (() => {
      // AxiosError often includes response.status
      const status = error?.response?.status;
      if (typeof status === 'number' && Number.isFinite(status)) return status;

      // Our own errors often look like: "HTTP 403: ..."
      let match = message.match(/HTTP\s+(\d{3})/i);
      if (match) return Number(match[1]);

      // Axios default message: "Request failed with status code 403"
      match = message.match(/status\s+code\s+(\d{3})/i);
      if (match) return Number(match[1]);

      // Some proxies/layers: "Status 403" / "HTTP status 403"
      match = message.match(/\bstatus\s+(\d{3})\b/i);
      if (match) return Number(match[1]);

      return undefined;
    })();

    console.error(`❌ CCB Event Attendance API Error (${requestId}):`, message);

    // Common misconfig: missing server env vars on the hosting platform
    if (/Missing CCB env vars/i.test(message)) {
      return NextResponse.json(
        {
          error: 'CCB is not configured on the server',
          code: 'CCB_MISSING_ENV',
          hint: 'Set CCB_SUBDOMAIN, CCB_API_USERNAME, and CCB_API_PASSWORD in your production environment variables (Netlify).',
          requestId,
        },
        { status: 503 }
      );
    }

    // Auth failures (bad credentials)
    if (
      upstreamStatusFromError === 401 ||
      upstreamStatusFromError === 403 ||
      /HTTP\s+401/i.test(message) ||
      /HTTP\s+403/i.test(message)
    ) {
      return NextResponse.json(
        {
          error: 'CCB authentication failed',
          code: 'CCB_AUTH_FAILED',
          hint: 'Verify CCB_API_USERNAME / CCB_API_PASSWORD are correct for the configured subdomain. If credentials are correct, CCB may be blocking Netlify outbound IPs.',
          requestId,
        },
        { status: 502 }
      );
    }

    // Rate limiting
    if (/Rate limited \(429\)/i.test(message) || /HTTP\s+429/i.test(message)) {
      return NextResponse.json(
        {
          error: 'CCB rate limit hit',
          code: 'CCB_RATE_LIMITED',
          hint: 'CCB is rate-limiting requests. Wait a minute and try again, or reduce request volume.',
          requestId,
        },
        { status: 429 }
      );
    }

    // Network / timeout issues
    if (/timeout|ECONNABORTED/i.test(message)) {
      return NextResponse.json(
        {
          error: 'CCB request timed out',
          code: 'CCB_TIMEOUT',
          hint: 'CCB did not respond in time. This can happen if CCB is slow or blocking serverless traffic. Try again, and check Netlify function logs for requestId.',
          requestId,
        },
        { status: 504 }
      );
    }

    if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(message)) {
      return NextResponse.json(
        {
          error: 'CCB DNS lookup failed',
          code: 'CCB_DNS_FAILED',
          hint: 'The server could not resolve the CCB hostname. Double-check CCB_SUBDOMAIN and try redeploying. If correct, this may be a transient Netlify/DNS issue.',
          requestId,
        },
        { status: 502 }
      );
    }

    if (/ECONNREFUSED|socket hang up|ETIMEDOUT/i.test(message)) {
      return NextResponse.json(
        {
          error: 'Could not connect to CCB',
          code: 'CCB_CONNECTION_FAILED',
          hint: 'The server could not reach CCB. If CCB is up, it may be blocking Netlify outbound traffic or requiring IP allowlisting.',
          requestId,
        },
        { status: 502 }
      );
    }

    // Upstream returned a 4xx/5xx (bad request, forbidden, etc.)
    if (typeof upstreamStatusFromError === 'number') {
      const upstreamStatus = upstreamStatusFromError;
      console.error(`❌ CCB Upstream Error (${requestId}): HTTP ${upstreamStatus}`);

      const hint =
        upstreamStatus === 404
          ? 'CCB API endpoint not found (404). Most commonly: CCB_SUBDOMAIN is incorrect, or your church uses a custom CCB domain. Set CCB_BASE_URL to your CCB site (e.g. https://yourchurch.ccbchurch.com or your custom domain).'
          : 'CCB rejected the request. If this persists, verify CCB credentials, subdomain, and that the attendance APIs are enabled for this account.';

      return NextResponse.json(
        {
          error: 'CCB returned an error response',
          code: 'CCB_UPSTREAM_ERROR',
          upstreamStatus,
          hint,
          requestId,
        },
        { status: 502 }
      );
    }

    // Default
    return NextResponse.json(
      {
        error: 'Failed to fetch CCB event data',
        code: 'CCB_FETCH_FAILED',
        requestId,
      },
      { status: 500 }
    );
  }
}

// Optional: GET endpoint to test API connection
export async function GET() {
  try {
    const ccbClient = createCCBClient();
    const isConnected = await ccbClient.testConnection();

    return NextResponse.json({
      connected: isConnected,
      message: isConnected
        ? 'CCB API connection successful'
        : 'CCB API connection failed',
    });
  } catch (error: any) {
    const message = (error?.message || '').toString();

    if (/Missing CCB env vars/i.test(message)) {
      return NextResponse.json(
        {
          connected: false,
          error: 'CCB is not configured on the server',
          code: 'CCB_MISSING_ENV',
          hint: 'Set CCB_SUBDOMAIN, CCB_API_USERNAME, and CCB_API_PASSWORD in your production environment variables (Netlify).',
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        connected: false,
        error: 'CCB connection failed',
        code: 'CCB_CONNECTION_FAILED',
      },
      { status: 500 }
    );
  }
}
