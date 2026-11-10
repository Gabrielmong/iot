/** One candidate RTSP path scheme for a recorder's per-channel main and sub streams. */
export interface SwannPathTemplate {
  /** Stable identifier, stored with the probe result. */
  readonly name: string;
  mainPath(channel: number): string;
  subPath(channel: number): string;
}

const nn = (channel: number) => String(channel).padStart(2, '0');

/** Tried in this order; the first that answers channel 1 is used for every channel. */
export const SWANN_PATH_TEMPLATES: readonly SwannPathTemplate[] = [
  {
    name: '/ch{NN}/0|1',
    mainPath: (ch) => `/ch${nn(ch)}/0`,
    subPath: (ch) => `/ch${nn(ch)}/1`,
  },
  {
    name: '/cam/realmonitor?channel={N}&subtype=0|1',
    mainPath: (ch) => `/cam/realmonitor?channel=${ch}&subtype=0`,
    subPath: (ch) => `/cam/realmonitor?channel=${ch}&subtype=1`,
  },
  {
    name: '/Streaming/Channels/{N}01|{N}02',
    mainPath: (ch) => `/Streaming/Channels/${ch}01`,
    subPath: (ch) => `/Streaming/Channels/${ch}02`,
  },
];
