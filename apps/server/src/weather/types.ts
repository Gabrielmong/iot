/** Our own small set of conditions, mapped from the provider's codes. */
export type WeatherCondition = "CLEAR" | "PARTLY_CLOUDY" | "CLOUDY" | "FOG" | "DRIZZLE" | "RAIN" | "STORM" | "SNOW" | "WINDY" | "UNKNOWN";

export type CurrentWeather = {
  tempC: number;
  feelsLikeC: number;
  humidity: number;
  windKph: number;
  condition: WeatherCondition;
  isDay: boolean;
  precipMm: number;
  /** Rain, drizzle or a storm right now. */
  raining: boolean;
};
export type HourlyWeather = { time: Date; tempC: number; condition: WeatherCondition; rainChance: number };
/** date: YYYY-MM-DD in the location's local time. */
export type DailyWeather = { date: string; minC: number; maxC: number; condition: WeatherCondition; rainChance: number };
export type WeatherData = { current: CurrentWeather; hourly: HourlyWeather[]; daily: DailyWeather[] };
/** WeatherData for a pin, and when it was fetched. */
export type WeatherReading = WeatherData & { fetchedAt: Date; lat: number; lng: number };

export type XweatherCredentials = { clientId: string; clientSecret: string };
export type LatLng = { lat: number; lng: number };

/** Fetches weather for a point. Injected so tests never reach Xweather. */
export type WeatherFetcher = (creds: XweatherCredentials, at: LatLng) => Promise<WeatherData>;

/** A failed fetch; `auth` when the provider rejected the credentials. The message never holds credentials. */
export class WeatherFetchError extends Error {
  constructor(
    message: string,
    readonly auth: boolean,
  ) {
    super(message);
    this.name = "WeatherFetchError";
  }
}
