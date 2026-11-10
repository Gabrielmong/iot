/** Byte layout of the two Tuya frame envelopes. */
export const PREFIX_55AA = 0x000055aa;
export const SUFFIX_55AA = 0x0000aa55;
export const PREFIX_6699 = 0x00006699;
export const SUFFIX_6699 = 0x00009966;

/** 55AA header: prefix, seq, cmd, length (bytes after the header). */
export const HEADER_55AA_LEN = 16;
/** 6699 header: prefix, 2 reserved bytes, seq, cmd, length (bytes between header and suffix). */
export const HEADER_6699_LEN = 18;
export const SUFFIX_LEN = 4;
export const RETCODE_LEN = 4;
export const CRC_LEN = 4;
export const HMAC_LEN = 32;
export const GCM_IV_LEN = 12;
export const GCM_TAG_LEN = 16;

/** Sanity limit on a frame's declared length (tinytuya MAX_PAYLOAD_LENGTH); larger means a corrupt stream. */
export const MAX_DECLARED_LENGTH = 1440;
