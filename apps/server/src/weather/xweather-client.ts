import { conditionFromCode } from "./xweather-codes.js";
import { WeatherFetchError, type CurrentWeather, type DailyWeather, type HourlyWeather, type LatLng, type WeatherData, type XweatherCredentials } from "./types.js";

const BASE = "https://data.api.xweather.com/batch/";
const REQUESTS = ["/conditions?filter=1hr&plimit=1", "/forecasts?filter=1hr&limit=12", "/forecasts?filter=day&limit=5"];
const TIMEOUT_MS = 15_000;
const RAINY = new Set(["RAIN", "DRIZZLE", "STORM"]);

type Period = Record<string, unknown>;
type Part = { success?: boolean; error?: { code?: string } | null; response?: { periods?: Period[] }[] };
type Body = { success?: boolean; error?: { code?: string; description?: string } | null; response?: { responses?: Part[] } };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function current(p: Period): CurrentWeather {
  const condition = conditionFromCode(p.weatherPrimaryCoded as string);
  return {
    tempC: num(p.tempC),
    feelsLikeC: num(p.feelslikeC),
    humidity: Math.round(num(p.humidity)),
    windKph: num(p.windSpeedKPH),
    condition,
    isDay: p.isDay !== false,
    precipMm: num(p.precipMM),
    raining: RAINY.has(condition),
  };
}

const hourly = (p: Period): HourlyWeather => ({
  time: new Date(String(p.dateTimeISO)),
  tempC: num(p.tempC),
  condition: conditionFromCode(p.weatherPrimaryCoded as string),
  rainChance: Math.round(num(p.pop)),
});

const daily = (p: Period): DailyWeather => ({
  date: String(p.dateTimeISO).slice(0, 10),
  minC: num(p.minTempC),
  maxC: num(p.maxTempC),
  condition: conditionFromCode(p.weatherPrimaryCoded as string),
  rainChance: Math.round(num(p.pop)),
});

const isAuthCode = (code: string | undefined) => code === "invalid_client" || code === "unauthorized_client" || code === "invalid_request";

/** Current conditions, the next 12 hours and the next 5 days for a point, in one Xweather batch request. */
export async function fetchXweather(creds: XweatherCredentials, at: LatLng, fetchImpl: typeof fetch = globalThis.fetch): Promise<WeatherData> {
  const params = new URLSearchParams({ requests: REQUESTS.join(","), client_id: creds.clientId, client_secret: creds.clientSecret });
  let res: Response;
  try {
    res = await fetchImpl(`${BASE}${at.lat},${at.lng}?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new WeatherFetchError("Couldn't reach Xweather", false);
  }
  const body = (await res.json().catch(() => null)) as Body | null;
  if (!res.ok || !body?.success) {
    const code = body?.error?.code;
    const auth = res.status === 401 || res.status === 403 || isAuthCode(code);
    throw new WeatherFetchError(auth ? "Xweather rejected the credentials" : `Xweather failed (${code ?? `HTTP ${res.status}`})`, auth);
  }
  const parts = body.response?.responses ?? [];
  const periods = (i: number) => parts[i]?.response?.[0]?.periods ?? [];
  const now = periods(0)[0];
  if (!now) throw new WeatherFetchError("Xweather sent no current conditions", false);
  return { current: current(now), hourly: periods(1).map(hourly), daily: periods(2).map(daily) };
}
