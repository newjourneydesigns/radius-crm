/**
 * Weather Service for Flower Mound, TX 75028
 * Uses Open-Meteo API — completely free, no API key required.
 * https://open-meteo.com/
 */

// Flower Mound, TX 75028 coordinates
const LATITUDE = 33.0237;
const LONGITUDE = -97.0967;
const LOCATION_NAME = 'Flower Mound, TX';

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
 * Fetch current weather for Flower Mound, TX from Open-Meteo.
 * Returns null if the request fails (the email should still send without weather).
 */
export async function fetchWeather(): Promise<WeatherData | null> {
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(LATITUDE));
    url.searchParams.set('longitude', String(LONGITUDE));
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
      location: LOCATION_NAME,
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
