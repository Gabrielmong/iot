/** WebSocket close codes for camera sockets. Reasons are fixed words, never details. */
export const CLOSE_SESSION = 4401;
export const CLOSE_NO_ACCESS = 4404;
export const CLOSE_UNAVAILABLE = 4503;
/** The camera's stream source changed: a standard "service restart", so players simply reconnect. */
export const CLOSE_SOURCE_CHANGED = 1012;
