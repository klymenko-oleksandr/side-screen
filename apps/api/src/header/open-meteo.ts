import type { WeatherNow } from '@side-screen/shared';

/**
 * Open-Meteo (open-meteo.com): free for non-commercial use, no key. Data under CC BY 4.0,
 * so the UI credits "Open-Meteo" next to the weather.
 */
export function openMeteoUrl(
  latitude: number,
  longitude: number,
  timezone: string,
): string {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: 'temperature_2m,weather_code,is_day',
    timezone,
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

interface OpenMeteoCurrent {
  current?: { temperature_2m?: number; weather_code?: number; is_day?: number };
}

/** WMO weather interpretation codes, as Open-Meteo documents them. */
export function weatherSummary(code: number): string {
  if (code === 0) return 'clear';
  if (code === 1) return 'mostly clear';
  if (code === 2) return 'partly cloudy';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if (code >= 61 && code <= 67) return 'rain';
  if (code >= 71 && code <= 77) return 'snow';
  if (code >= 80 && code <= 82) return 'showers';
  if (code === 85 || code === 86) return 'snow showers';
  if (code >= 95) return 'thunderstorm';
  return 'unknown';
}

export function parseOpenMeteo(body: unknown): WeatherNow {
  const current = (body as OpenMeteoCurrent | null)?.current;
  if (typeof current?.temperature_2m !== 'number')
    throw new Error('no current temperature in the answer');
  return {
    tempC: current.temperature_2m,
    summary: weatherSummary(current.weather_code ?? -1),
  };
}
