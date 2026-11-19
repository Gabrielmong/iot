import { badInput } from "../api-errors.js";
import type { WeatherFacts } from "../weather/service.js";
import { isSunUp } from "../weather/sun.js";
import type { WeatherReading } from "../weather/types.js";

export type ConditionMetric = "TEMP_C" | "FEELS_LIKE_C" | "HUMIDITY" | "WIND_KPH" | "RAINING_NOW" | "RAIN_CHANCE_TODAY" | "SUN";
export type ConditionOp = "ABOVE" | "BELOW" | "IS" | "IS_NOT" | "IS_UP" | "IS_DOWN";
export type Condition = { metric: ConditionMetric; op: ConditionOp; value?: number };
export type ConditionInput = { metric: string; op: string; value?: number | null };

export const MAX_CONDITIONS = 5;
const HOUR_MS = 3_600_000;

type Numeric = { label: string; unit: string; min: number; max: number; read: (r: WeatherReading, now: Date) => number };

const NUMERIC: Record<string, Numeric> = {
  TEMP_C: { label: "Temperature", unit: "°", min: -50, max: 60, read: (r) => r.current.tempC },
  FEELS_LIKE_C: { label: "Feels like", unit: "°", min: -50, max: 60, read: (r) => r.current.feelsLikeC },
  HUMIDITY: { label: "Humidity", unit: "%", min: 0, max: 100, read: (r) => r.current.humidity },
  WIND_KPH: { label: "Wind", unit: " km/h", min: 0, max: 300, read: (r) => r.current.windKph },
  RAIN_CHANCE_TODAY: { label: "Rain chance today", unit: "%", min: 0, max: 100, read: rainChanceToday },
};
const NUMERIC_OPS: ConditionOp[] = ["ABOVE", "BELOW"];
const FLAG_OPS: Record<string, ConditionOp[]> = { RAINING_NOW: ["IS", "IS_NOT"], SUN: ["IS_UP", "IS_DOWN"] };

const sameLocalDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** The highest rain chance of the hours still to come today (including the current hour), else today's forecast. */
function rainChanceToday(r: WeatherReading, now: Date): number {
  const left = r.hourly.filter((h) => sameLocalDay(h.time, now) && h.time.getTime() + HOUR_MS > now.getTime());
  if (left.length > 0) return Math.max(...left.map((h) => h.rainChance));
  return r.daily[0]?.rainChance ?? 0;
}

export function parseConditions(input: ConditionInput[]): Condition[] {
  if (input.length < 1 || input.length > MAX_CONDITIONS) throw badInput(`Add 1 to ${MAX_CONDITIONS} conditions`);
  return input.map(parseCondition);
}

function parseCondition(c: ConditionInput): Condition {
  const numeric = Object.hasOwn(NUMERIC, c.metric) ? NUMERIC[c.metric] : undefined;
  const ops = numeric ? NUMERIC_OPS : Object.hasOwn(FLAG_OPS, c.metric) ? FLAG_OPS[c.metric] : undefined;
  if (!ops || !ops.includes(c.op as ConditionOp)) throw badInput("That check doesn't fit");
  const metric = c.metric as ConditionMetric;
  const op = c.op as ConditionOp;
  if (!numeric) return { metric, op };
  if (c.value === null || c.value === undefined || !Number.isFinite(c.value)) throw badInput("Enter a value");
  if (c.value < numeric.min || c.value > numeric.max) throw badInput(`${numeric.label} must be from ${numeric.min} to ${numeric.max}`);
  return { metric, op, value: c.value };
}

/** True when every condition holds; "UNKNOWN" when any needs weather or a location that isn't available. */
export function evaluate(conditions: Condition[], facts: WeatherFacts): boolean | "UNKNOWN" {
  let all = true;
  for (const c of conditions) {
    const result = check(c, facts);
    if (result === "UNKNOWN") return "UNKNOWN";
    all &&= result;
  }
  return all;
}

function check(c: Condition, facts: WeatherFacts): boolean | "UNKNOWN" {
  if (c.metric === "SUN") {
    if (!facts.location) return "UNKNOWN";
    return isSunUp(facts.now, facts.location) === (c.op === "IS_UP");
  }
  if (!facts.reading) return "UNKNOWN";
  if (c.metric === "RAINING_NOW") return facts.reading.current.raining === (c.op === "IS");
  const actual = NUMERIC[c.metric].read(facts.reading, facts.now);
  return c.op === "ABOVE" ? actual > c.value! : actual < c.value!;
}

/** "temperature above 28° and raining now" */
export function describeConditions(conditions: Condition[]): string {
  return conditions.map(describe).join(" and ");
}

function describe(c: Condition): string {
  if (c.metric === "SUN") return c.op === "IS_UP" ? "the sun is up" : "the sun is down";
  if (c.metric === "RAINING_NOW") return c.op === "IS" ? "raining now" : "not raining now";
  const n = NUMERIC[c.metric];
  return `${n.label.toLowerCase()} ${c.op === "ABOVE" ? "above" : "below"} ${c.value}${n.unit}`;
}
