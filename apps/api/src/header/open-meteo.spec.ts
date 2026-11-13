import { parseConfig } from '../config/config.loader';
import { OpenMeteoHeaderSource } from './header.module';
import { openMeteoUrl, parseOpenMeteo, weatherSummary } from './open-meteo';

describe('Open-Meteo', () => {
  afterEach(() => jest.restoreAllMocks());

  it('asks for current temperature and weather code at the configured spot', () => {
    expect(openMeteoUrl(50.45, 30.52, 'Europe/Kyiv')).toBe(
      'https://api.open-meteo.com/v1/forecast?latitude=50.45&longitude=30.52&current=temperature_2m%2Cweather_code%2Cis_day&timezone=Europe%2FKyiv',
    );
  });

  it('turns WMO codes into words', () => {
    expect(weatherSummary(0)).toBe('clear');
    expect(weatherSummary(3)).toBe('cloudy');
    expect(weatherSummary(63)).toBe('rain');
    expect(weatherSummary(73)).toBe('snow');
    expect(weatherSummary(96)).toBe('thunderstorm');
  });

  it('parses the current block and rejects an empty answer', () => {
    expect(
      parseOpenMeteo({
        current: { temperature_2m: 3.6, weather_code: 3, is_day: 1 },
      }),
    ).toEqual({ tempC: 3.6, summary: 'cloudy' });
    expect(() => parseOpenMeteo({})).toThrow(/no current temperature/);
  });

  it('feeds the header with the city and weather', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          current: { temperature_2m: -1.2, weather_code: 71 },
        }),
        { status: 200 },
      ),
    );
    const data = await new OpenMeteoHeaderSource(parseConfig({})).fetch();
    expect(data).toEqual({
      city: 'Kyiv',
      weather: { tempC: -1.2, summary: 'snow' },
    });
  });
});
