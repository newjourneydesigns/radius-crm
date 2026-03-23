/**
 * Weather Service — per-user location support
 * Uses Open-Meteo API — completely free, no API key required.
 * https://open-meteo.com/
 *
 * Default location: Flower Mound, TX 75028
 * Users can set their own city/state/zip in email preferences.
 */

// Default: Flower Mound, TX 75028
const DEFAULT_LATITUDE = 33.0237;
const DEFAULT_LONGITUDE = -97.0967;
const DEFAULT_LOCATION_NAME = 'Flower Mound, TX';

export interface WeatherLocation {
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}

export interface WeatherData {
  location: string;
  temperature: number;        // Current temp in °F
  feelsLike: number;          // Apparent temperature in °F
  humidity: number;           // Relative humidity %
  windSpeed: number;          // Wind speed in mph
  weatherCode: number;        // WMO weather code
  description: string;        // Human-readable description
  emoji: string;              // Weather emoji
  highTemp: number;           // Today's high in °F
  lowTemp: number;            // Today's low in °F
  precipChance: number;       // Precipitation probability %
}

interface GeoResult {
  latitude: number;
  longitude: number;
  name: string;
  admin1?: string; // state/region
  country_code?: string;
}

/** Map WMO weather codes to descriptions and emoji */
function weatherCodeToInfo(code: number): { description: string; emoji: string } {
  if (code === 0) return { description: 'Clear sky', emoji: '☀️' };
  if (code === 1) return { description: 'Mainly clear', emoji: '🌤️' };
  if (code === 2) return { description: 'Partly cloudy', emoji: '⛅' };
  if (code === 3) return { description: 'Overcast', emoji: '☁️' };
  if (code === 45 || code === 48) return { description: 'Foggy', emoji: '🌫️' };
  if (code >= 51 && code <= 57) return { description: 'Drizzle', emoji: '🌦️' };
  if (code >= 61 && code <= 65) return { description: 'Rain', emoji: '🌧️' };
  if (code === 66 || code === 67) return { description: 'Freezing rain', emoji: '🌧️' };
  if (code >= 71 && code <= 77) return { description: 'Snow', emoji: '❄️' };
  if (code >= 80 && code <= 82) return { description: 'Rain showers', emoji: '🌧️' };
  if (code === 85 || code === 86) return { description: 'Snow showers', emoji: '❄️' };
  if (code >= 95 && code <= 99) return { description: 'Thunderstorm', emoji: '⛈️' };
  return { description: 'Unknown', emoji: '🌡️' };
}

// Cache geocode results for the lifetime of the server process
const geocodeCache = new Map<string, { lat: number; lon: number; name: string } | null>();

/**
 * Geocode a city/state or zip code to lat/lon using Open-Meteo's free geocoding API.
 * Returns null if geocoding fails.
 */
async function geocodeLocation(location: WeatherLocation): Promise<{ lat: number; lon: number; name: string } | null> {
  const cacheKey = `${location.city || ''}|${location.state || ''}|${location.zip || ''}`;
  if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey)!;
  // US state abbreviation → full name map (for display and result filtering)
  const STATE_NAMES: Record<string, string> = {
    AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',
    CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',
    HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',
    KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',
    MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',
    MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',
    NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',
    OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',
    SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',
    VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',
  };

  async function queryGeo(query: string): Promise<GeoResult[]> {
    const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
    url.searchParams.set('name', query);
    url.searchParams.set('count', '10');
    url.searchParams.set('language', 'en');
    url.searchParams.set('format', 'json');
    const response = await fetch(url.toString(), { signal: AbortSignal.timeout(2000) });
    if (!response.ok) return [];
    const json = await response.json();
    return json.results || [];
  }

  try {
    let results: GeoResult[] = [];
    const stateAbbr = location.state?.trim().toUpperCase() || '';
    const stateFull = STATE_NAMES[stateAbbr] || location.state || '';

    if (location.city) {
      // Search by city name only — state abbreviations break Open-Meteo geocoding
      results = await queryGeo(location.city.trim());

      if (results.length === 0 && location.zip) {
        results = await queryGeo(location.zip.trim());
      }
    } else if (location.zip) {
      results = await queryGeo(location.zip.trim());
    } else {
      return null;
    }

    if (results.length === 0) {
      console.warn(`No geocoding results for "${location.city || location.zip}"`);
      geocodeCache.set(cacheKey, null);
      return null;
    }

    // Prefer US results, then try to match state if provided
    const usResults = results.filter(r => r.country_code === 'US');
    const pool = usResults.length > 0 ? usResults : results;

    let best = pool[0];
    if (stateFull) {
      const stateMatch = pool.find(r =>
        r.admin1?.toLowerCase() === stateFull.toLowerCase()
      );
      if (stateMatch) best = stateMatch;
    }

    // Build display name: "City, StateFull" if state known, else "City, admin1"
    let displayState = stateFull || best.admin1 || '';
    // If stateFull is already a full name, use it; otherwise use admin1
    const displayName = displayState ? `${best.name}, ${displayState}` : best.name;

    const result = { lat: best.latitude, lon: best.longitude, name: displayName };
    geocodeCache.set(cacheKey, result);
    return result;
  } catch (error: any) {
    console.error('Geocoding failed:', error.message);
    return null;
  }
}

/**
 * Fetch current weather from Open-Meteo.
 * If a user location is provided, geocode it first. Falls back to Flower Mound, TX.
 * Returns null if the request fails (the email should still send without weather).
 */
export async function fetchWeather(location?: WeatherLocation | null): Promise<WeatherData | null> {
  try {
    let lat = DEFAULT_LATITUDE;
    let lon = DEFAULT_LONGITUDE;
    let locationName = DEFAULT_LOCATION_NAME;

    // If user has a custom location, try to geocode it
    if (location && (location.city || location.zip)) {
      const geo = await geocodeLocation(location);
      if (geo) {
        lat = geo.lat;
        lon = geo.lon;
        locationName = geo.name;
      }
    }

    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lon));
    url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m');
    url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code');
    url.searchParams.set('temperature_unit', 'fahrenheit');
    url.searchParams.set('wind_speed_unit', 'mph');
    url.searchParams.set('timezone', 'America/Chicago');
    url.searchParams.set('forecast_days', '1');

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(2000), // 5 second timeout
    });

    if (!response.ok) {
      console.error(`Open-Meteo API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const json = await response.json();

    const current = json.current;
    const daily = json.daily;

    if (!current || !daily) {
      console.error('Unexpected Open-Meteo response shape:', JSON.stringify(json).slice(0, 500));
      return null;
    }

    const { description, emoji } = weatherCodeToInfo(current.weather_code);

    return {
      location: locationName,
      temperature: Math.round(current.temperature_2m),
      feelsLike: Math.round(current.apparent_temperature),
      humidity: Math.round(current.relative_humidity_2m),
      windSpeed: Math.round(current.wind_speed_10m),
      weatherCode: current.weather_code,
      description,
      emoji,
      highTemp: Math.round(daily.temperature_2m_max[0]),
      lowTemp: Math.round(daily.temperature_2m_min[0]),
      precipChance: Math.round(daily.precipitation_probability_max[0] ?? 0),
    };
  } catch (error: any) {
    console.error('Failed to fetch weather:', error.message);
    return null;
  }
}
