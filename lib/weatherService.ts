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

/**
 * Geocode a city/state or zip code to lat/lon using Open-Meteo's free geocoding API.
 * Returns null if geocoding fails.
 */
async function geocodeLocation(location: WeatherLocation): Promise<{ lat: number; lon: number; name: string } | null> {
  try {
    // Build search query: prefer "city, state" if available, fall back to zip
    let query = '';
    if (location.city && location.state) {
      query = `${location.city}, ${location.state}`;
    } else if (location.city) {
      query = location.city;
    } else if (location.zip) {
      query = location.zip;
    } else {
      return null;
    }

    const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
    url.searchParams.set('name', query);
    url.searchParams.set('count', '5');
    url.searchParams.set('language', 'en');
    url.searchParams.set('format', 'json');

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.error(`Geocoding API error: ${response.status}`);
      return null;
    }

    const json = await response.json();
    const results: GeoResult[] = json.results || [];

    if (results.length === 0) {
      console.warn(`No geocoding results for "${query}"`);
      return null;
    }

    // Try to find a US result first
    const usResult = results.find(r => r.country_code === 'US') || results[0];
    const displayName = usResult.admin1
      ? `${usResult.name}, ${usResult.admin1}`
      : usResult.name;

    return {
      lat: usResult.latitude,
      lon: usResult.longitude,
      name: displayName,
    };
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
      signal: AbortSignal.timeout(5000), // 5 second timeout
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
