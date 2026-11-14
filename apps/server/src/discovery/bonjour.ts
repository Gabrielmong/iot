import { Bonjour } from "bonjour-service";

export interface PublishOptions {
  name: string;
  type: string;
  protocol: "tcp";
  port: number;
  txt?: Record<string, string>;
}

/** The slice of bonjour-service used here, so tests can fake it. */
export interface BonjourLike {
  /** Publishes; `onUp` runs once the service has actually been announced. */
  publish(opts: PublishOptions, onUp: () => void): void;
  unpublishAll(cb?: () => void): void;
  destroy(cb?: () => void): void;
  /** Errors from the underlying socket, which binds asynchronously after construction. */
  onError(handler: (err: Error) => void): void;
}

interface MdnsEmitter {
  on(event: "error", handler: (err: Error) => void): unknown;
}

/**
 * Wraps bonjour-service. multicast-dns takes `interface`, which bonjour-service's types omit.
 * Its default error callback throws, so it gets a no-op; socket errors are routed to `onError` instead,
 * since bonjour-service never listens for the mdns emitter's own 'error' event.
 */
export function createBonjour(host?: string): BonjourLike {
  const bonjour = new Bonjour((host ? { interface: host } : undefined) as ConstructorParameters<typeof Bonjour>[0], () => {});
  const mdns = (bonjour as unknown as { server: { mdns: MdnsEmitter } }).server.mdns;
  return {
    publish: (opts, onUp) => {
      bonjour.publish(opts).on("up", onUp);
    },
    unpublishAll: (cb) => bonjour.unpublishAll(cb),
    destroy: (cb) => bonjour.destroy(cb),
    onError: (handler) => {
      mdns.on("error", handler);
    },
  };
}
