import { authorizationFor, type RtspCredentials } from '../digest-auth/authorization.js';
import { parseWwwAuthenticate } from '../digest-auth/www-authenticate.js';
import { OnvifAuthError, OnvifFaultError, OnvifUnreachableError } from './errors.js';
import { soapEnvelope, soapPost, type SoapReply } from './soap.js';
import { wsSecurityHeader } from './wsse.js';
import { xmlElements } from './xml.js';

/** Where an ONVIF camera's services answer. */
export interface OnvifTarget {
  host: string;
  port: number;
  timeoutMs: number;
}

/** The login, and the camera clock's offset from ours (for WS-Security `Created`). */
export interface OnvifAuth {
  creds: RtspCredentials;
  clockOffsetMs: number;
  now: () => Date;
}

/** One SOAP operation: its action URI and its body element. */
export interface OnvifOperation {
  action: string;
  body: string;
}

/** Fault texts that mean the login was refused (ONVIF `ter:NotAuthorized`, WS-Security failures). */
const AUTH_FAULT_MARKERS = ['notauthorized', 'not authorized', 'failedauthentication', 'invalidsecurity'];

/**
 * Calls one operation at `http://host:port<path>` and resolves the reply's XML. With `auth` the call
 * carries a PasswordDigest UsernameToken and, when the camera answers HTTP 401 with a Digest challenge,
 * is retried once with an RFC 2617 Digest Authorization header too (Basic is never answered, so no
 * credentials are sent to a Basic-only camera). Rejects with OnvifUnreachableError (transport, timeout,
 * oversized reply), OnvifAuthError (HTTP 401 or an auth fault) or OnvifFaultError (anything else that is
 * not a 200 without a fault).
 */
export async function onvifCall(target: OnvifTarget, path: string, op: OnvifOperation, auth?: OnvifAuth): Promise<string> {
  let reply = await post(target, path, op, auth);
  if (reply.status === 401 && auth) {
    const authorization = authorizationFor(parseWwwAuthenticate(reply.wwwAuthenticate), auth.creds, 'POST', path);
    if (!authorization) throw new OnvifAuthError(target.host);
    reply = await post(target, path, op, auth, authorization);
  }
  if (reply.status === 401) throw new OnvifAuthError(target.host);
  const fault = xmlElements(reply.body, 'Fault')[0];
  if (fault) {
    const text = fault.inner.toLowerCase();
    if (AUTH_FAULT_MARKERS.some((m) => text.includes(m))) throw new OnvifAuthError(target.host);
  }
  if (fault || reply.status !== 200) throw new OnvifFaultError(target.host, reply.status);
  return reply.body;
}

/** One POST, with a fresh WS-Security header (new nonce) when authenticating. */
async function post(target: OnvifTarget, path: string, op: OnvifOperation, auth?: OnvifAuth, authorization?: string): Promise<SoapReply> {
  const header = auth ? wsSecurityHeader(auth.creds, new Date(auth.now().getTime() + auth.clockOffsetMs)) : '';
  try {
    return await soapPost(`http://${target.host}:${target.port}${path}`, op.action, soapEnvelope(op.body, header), target.timeoutMs, authorization);
  } catch (err) {
    throw new OnvifUnreachableError(target.host, { cause: err });
  }
}
