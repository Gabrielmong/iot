import { TuyaCloudAuthError, TuyaCloudExpiredError } from './cloud-errors.js';
import { CloudHttp } from './cloud-http.js';
import { allocateCloudStream, type CloudStream, type CloudStreamType } from './cloud-stream.js';
import { mapCloudDevice, type CloudDeviceRow, type CloudSpec, type TuyaCloudDevice } from './cloud-mapping.js';
import { TUYA_REGION_HOSTS, type TuyaRegion } from './cloud-regions.js';
import { CAMERA_CATEGORIES, deriveCameraFeatures, type CameraFeatures } from './camera-features.js';
import { fetchThingModel, issueProperties, readShadow } from './cloud-thing.js';

export { isCloudAccountRefusal, TuyaCloudAuthError, TuyaCloudError, TuyaCloudExpiredError, TuyaCloudStreamUnavailableError } from './cloud-errors.js';
export type { TuyaCloudDevice } from './cloud-mapping.js';
export type { CloudStream, CloudStreamType } from './cloud-stream.js';
export { isSafeCloudStreamUrl } from './cloud-stream-url.js';

export type TuyaCloudOptions = {
  accessId: string;
  accessSecret: string;
  region: TuyaRegion;
  fetchImpl?: typeof fetch;
};

type AllDevicesPage = { devices?: CloudDeviceRow[]; has_more?: boolean; last_row_key?: string };
type UserDevicesPage = { list?: CloudDeviceRow[]; has_more?: boolean; last_row_key?: string };

/**
 * The Tuya OpenAPI: the key sync (flow follows tinytuya's Cloud class: all devices -> per-owner list
 * (carries local_key) -> specifications) and cloud cameras' temporary stream URLs.
 */
export class TuyaCloud {
  private readonly http: CloudHttp;

  constructor(opts: TuyaCloudOptions) {
    this.http = new CloudHttp({
      accessId: opts.accessId,
      accessSecret: opts.accessSecret,
      host: TUYA_REGION_HOSTS[opts.region],
      ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
    });
  }

  async listDevices(): Promise<TuyaCloudDevice[]> {
    const rows = new Map<string, CloudDeviceRow>();
    const owners = new Set<string>();
    for (const row of await this.allDevices()) {
      rows.set(row.id, row);
      if (row.uid) owners.add(row.uid);
    }
    for (const uid of owners) {
      for (const row of await this.devicesOfUser(uid)) rows.set(row.id, { ...rows.get(row.id), ...row });
    }
    const devices: TuyaCloudDevice[] = [];
    for (const row of rows.values()) {
      const device = mapCloudDevice(row, await this.specOrUndefined(row.id));
      const cameraFeatures = CAMERA_CATEGORIES.has(device.category) ? await this.cameraFeaturesOrUndefined(row.id) : undefined;
      devices.push(cameraFeatures ? { ...device, cameraFeatures } : device);
    }
    return devices;
  }

  /** A temporary stream URL for a cloud camera; throws TuyaCloudStreamUnavailableError. */
  allocateStream(deviceId: string, type: CloudStreamType): Promise<CloudStream> {
    return allocateCloudStream(this.http, deviceId, type);
  }

  /** A camera's current control values (thing shadow), by code. */
  readCameraValues(deviceId: string): Promise<Record<string, unknown>> {
    return readShadow(this.http, deviceId);
  }

  /** Sends control values to a camera (thing shadow). */
  issueCameraProperties(deviceId: string, props: Record<string, unknown>): Promise<void> {
    return issueProperties(this.http, deviceId, props);
  }

  /** Like specOrUndefined: a failed model call only costs the camera its features. */
  private async cameraFeaturesOrUndefined(deviceId: string): Promise<CameraFeatures | undefined> {
    try {
      return deriveCameraFeatures(await fetchThingModel(this.http, deviceId));
    } catch (err) {
      if (err instanceof TuyaCloudAuthError || err instanceof TuyaCloudExpiredError) throw err;
      return undefined;
    }
  }

  /** A failed spec call only costs that device its dpSchema; credential/subscription errors still abort. */
  private async specOrUndefined(deviceId: string): Promise<CloudSpec | undefined> {
    try {
      return await this.http.get<CloudSpec>(`/v1.1/devices/${encodeURIComponent(deviceId)}/specifications`);
    } catch (err) {
      if (err instanceof TuyaCloudAuthError || err instanceof TuyaCloudExpiredError) throw err;
      return undefined;
    }
  }

  private allDevices(): Promise<CloudDeviceRow[]> {
    return this.paged<AllDevicesPage>('/v1.0/iot-01/associated-users/devices', { size: '50' }, (p) => p.devices);
  }

  private devicesOfUser(uid: string): Promise<CloudDeviceRow[]> {
    return this.paged<UserDevicesPage>(
      '/v1.3/iot-03/devices',
      { page_size: '75', source_id: uid, source_type: 'tuyaUser' },
      (p) => p.list,
    );
  }

  /** Follows `last_row_key` paging; query keys are sorted because Tuya signs the sorted query. */
  private async paged<P extends { has_more?: boolean; last_row_key?: string }>(
    base: string,
    query: Record<string, string>,
    rowsOf: (page: P) => CloudDeviceRow[] | undefined,
  ): Promise<CloudDeviceRow[]> {
    const out: CloudDeviceRow[] = [];
    const params = { ...query };
    for (;;) {
      const qs = Object.keys(params)
        .sort()
        .map((k) => `${k}=${params[k]}`)
        .join('&');
      const page = await this.http.get<P>(`${base}?${qs}`);
      out.push(...(rowsOf(page) ?? []));
      if (!page.has_more || !page.last_row_key) return out;
      params.last_row_key = page.last_row_key;
    }
  }
}
