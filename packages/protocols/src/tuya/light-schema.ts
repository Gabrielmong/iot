/** Which DPs a Tuya light uses, and how it scales brightness and encodes colour. */
export type DpSchema = {
  switch: string;
  mode?: string;
  brightness?: string;
  colorTemp?: string;
  color?: string;
  brightnessRange: [number, number];
  colorFormat: 'hsv12' | 'rgbhsv14';
};

/** Newer ("v2") Tuya lights. */
export const V2_LIGHT_SCHEMA: DpSchema = {
  switch: '20',
  mode: '21',
  brightness: '22',
  colorTemp: '23',
  color: '24',
  brightnessRange: [10, 1000],
  colorFormat: 'hsv12',
};

/** Older ("v1") Tuya lights. */
export const V1_LIGHT_SCHEMA: DpSchema = {
  switch: '1',
  mode: '2',
  brightness: '3',
  colorTemp: '4',
  color: '5',
  brightnessRange: [25, 255],
  colorFormat: 'rgbhsv14',
};
