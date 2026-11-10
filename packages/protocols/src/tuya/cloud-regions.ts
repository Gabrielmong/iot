export type TuyaRegion = 'us' | 'eu' | 'cn' | 'in';

/**
 * OpenAPI hosts per data centre, copied from tinytuya's Cloud.setregion():
 * https://github.com/jasonacox/tinytuya/blob/master/tinytuya/Cloud.py
 */
export const TUYA_REGION_HOSTS: Record<TuyaRegion, string> = {
  us: 'openapi.tuyaus.com',
  eu: 'openapi.tuyaeu.com',
  cn: 'openapi.tuyacn.com',
  in: 'openapi.tuyain.com',
};
