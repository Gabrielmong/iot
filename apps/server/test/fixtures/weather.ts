import type { WeatherData } from "../../src/weather/types.js";

/** A small fetch result for API tests. */
export const SAMPLE_WEATHER: WeatherData = {
  current: { tempC: 24, feelsLikeC: 25, humidity: 70, windKph: 10, condition: "CLEAR", isDay: true, precipMm: 0, raining: false },
  hourly: [],
  daily: [],
};
