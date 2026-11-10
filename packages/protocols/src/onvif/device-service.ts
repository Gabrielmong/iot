import { onvifCall, type OnvifAuth, type OnvifTarget } from './call.js';
import { OnvifFaultError } from './errors.js';
import { xmlElements, xmlText } from './xml.js';

/** The device service's usual path; ONVIF calls go here first. */
export const DEVICE_SERVICE_PATH = '/onvif/device_service';
/** The media service's usual path, used when the camera does not report its XAddr. */
export const MEDIA_SERVICE_PATH = '/onvif/media_service';

const DEVICE_NS = 'http://www.onvif.org/ver10/device/wsdl';

/**
 * The camera's UTC clock from GetSystemDateAndTime (read-only; unauthenticated unless `auth` is given,
 * for cameras that require a login even for this). Undefined when the reply carries no parseable
 * UTCDateTime; rejects like onvifCall when the service does not answer or refuses.
 */
export async function cameraUtcTime(target: OnvifTarget, auth?: OnvifAuth): Promise<Date | undefined> {
  const xml = await onvifCall(
    target,
    DEVICE_SERVICE_PATH,
    { action: `${DEVICE_NS}/GetSystemDateAndTime`, body: `<tds:GetSystemDateAndTime xmlns:tds="${DEVICE_NS}"/>` },
    auth,
  );
  const reply = xmlElements(xml, 'SystemDateAndTime')[0];
  if (!reply) throw new OnvifFaultError(target.host, 200); // answered, but not as ONVIF
  const utc = xmlElements(reply.inner, 'UTCDateTime')[0]?.inner;
  if (!utc) return undefined;
  const n = (name: string) => Number(xmlText(utc, name));
  const ms = Date.UTC(n('Year'), n('Month') - 1, n('Day'), n('Hour'), n('Minute'), n('Second'));
  return Number.isFinite(ms) ? new Date(ms) : undefined;
}

/**
 * The media service path from GetCapabilities' Media XAddr. Only the path (and query) is taken: the
 * host and port stay the ones we probed, so a camera cannot point us at another address.
 * Falls back to MEDIA_SERVICE_PATH when the camera faults or reports none; auth and transport errors propagate.
 */
export async function mediaServicePath(target: OnvifTarget, auth: OnvifAuth): Promise<string> {
  let xml: string;
  try {
    xml = await onvifCall(
      target,
      DEVICE_SERVICE_PATH,
      {
        action: `${DEVICE_NS}/GetCapabilities`,
        body: `<tds:GetCapabilities xmlns:tds="${DEVICE_NS}"><tds:Category>Media</tds:Category></tds:GetCapabilities>`,
      },
      auth,
    );
  } catch (err) {
    if (err instanceof OnvifFaultError) return MEDIA_SERVICE_PATH;
    throw err;
  }
  const media = xmlElements(xml, 'Media')[0];
  const xaddr = media && xmlText(media.inner, 'XAddr');
  return (xaddr && pathOf(xaddr)) ?? MEDIA_SERVICE_PATH;
}

function pathOf(xaddr: string): string | undefined {
  try {
    const url = new URL(xaddr);
    return url.protocol === 'http:' && url.pathname.length > 1 ? `${url.pathname}${url.search}` : undefined;
  } catch {
    return undefined;
  }
}
