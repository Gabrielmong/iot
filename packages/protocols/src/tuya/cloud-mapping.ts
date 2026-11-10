import { deriveDpSchema, type CloudSpecEntry } from './cloud-dp-schema.js';
import type { DpSchema } from './light-schema.js';
import type { CameraFeatures } from './camera-features.js';

export type TuyaCloudDevice = {
  id: string;
  name: string;
  category: string;
  productId: string;
  localKey: string;
  ip?: string;
  /** Whether the cloud currently sees the device connected (absent when the row doesn't say). */
  online?: boolean;
  dpSchema?: DpSchema;
  /** Cameras only: the controllable codes from the thing model. */
  cameraFeatures?: CameraFeatures;
};

/** A device row from the Tuya device-list endpoints. */
export type CloudDeviceRow = {
  id: string;
  name?: string;
  category?: string;
  product_id?: string;
  local_key?: string;
  ip?: string;
  uid?: string;
  online?: boolean;
};

/** Device specification reply (`/v1.1/devices/{id}/specifications`). */
export type CloudSpec = { functions?: CloudSpecEntry[]; status?: CloudSpecEntry[] };

export function mapCloudDevice(row: CloudDeviceRow, spec: CloudSpec | undefined): TuyaCloudDevice {
  const dpSchema = spec ? deriveDpSchema([...(spec.functions ?? []), ...(spec.status ?? [])]) : undefined;
  return {
    id: row.id,
    name: (row.name ?? '').trim(),
    category: row.category ?? '',
    productId: row.product_id ?? '',
    localKey: row.local_key ?? '',
    ...(row.ip ? { ip: row.ip } : {}),
    ...(typeof row.online === 'boolean' ? { online: row.online } : {}),
    ...(dpSchema ? { dpSchema } : {}),
  };
}
