/** Tuya LAN protocol versions this package speaks. */
export type TuyaVersion = '3.1' | '3.3' | '3.4' | '3.5';

export type Rgb = { r: number; g: number; b: number };

/** A light's state. `brightness` is 0-100; `colorTempK` is normalized to 2700-6500 K. */
export type LightState = { on: boolean; brightness: number /*0-100*/; mode: 'color' | 'white'; color?: Rgb; colorTempK?: number };

/** A change to a light. Setting `color` implies colour mode; setting `colorTempK` implies white mode. */
export type LightPatch = Partial<Omit<LightState, 'mode'>>;
