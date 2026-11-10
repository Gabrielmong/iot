import type { ThingModel } from './camera-features.js';
import type { CloudHttp } from './cloud-http.js';

const thing = (deviceId: string) => `/v2.0/cloud/thing/${encodeURIComponent(deviceId)}`;

/** A device's thing model (every property it has, including codes missing from its specification). */
export async function fetchThingModel(http: Pick<CloudHttp, 'get'>, deviceId: string): Promise<ThingModel> {
  const reply = await http.get<{ model?: string }>(`${thing(deviceId)}/model`);
  return reply?.model ? (JSON.parse(reply.model) as ThingModel) : {};
}

/** The device's current property values, by code. */
export async function readShadow(http: Pick<CloudHttp, 'get'>, deviceId: string): Promise<Record<string, unknown>> {
  const reply = await http.get<{ properties?: { code: string; value: unknown }[] }>(`${thing(deviceId)}/shadow/properties`);
  return Object.fromEntries((reply?.properties ?? []).map((p) => [p.code, p.value]));
}

/** Sends property values to the device. */
export async function issueProperties(http: Pick<CloudHttp, 'post'>, deviceId: string, props: Record<string, unknown>): Promise<void> {
  await http.post(`${thing(deviceId)}/shadow/properties/issue`, { properties: JSON.stringify(props) });
}
