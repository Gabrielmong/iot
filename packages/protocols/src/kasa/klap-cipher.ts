import { createCipheriv, createDecipheriv, createHash } from 'node:crypto';

/** Per-session KLAP secrets derived from the handshake seeds (python-kasa `KlapEncryptionSession`). */
export interface KlapMaterial {
  key: Buffer;
  /** First 12 bytes of the CBC IV; the last 4 are the request seq. */
  ivPrefix: Buffer;
  /** Seq derived from the IV hash. The first request uses `initialSeq + 1`. */
  initialSeq: number;
  /** Prefix of each request's signature hash. */
  sig: Buffer;
}

const sha256 = (...parts: Buffer[]) => createHash('sha256').update(Buffer.concat(parts)).digest();

export function deriveKlapMaterial(localSeed: Buffer, remoteSeed: Buffer, authHash: Buffer): KlapMaterial {
  const seeds = [localSeed, remoteSeed, authHash];
  const iv = sha256(Buffer.from('iv'), ...seeds);
  return {
    key: sha256(Buffer.from('lsk'), ...seeds).subarray(0, 16),
    ivPrefix: iv.subarray(0, 12),
    initialSeq: iv.readInt32BE(28),
    sig: sha256(Buffer.from('ldk'), ...seeds).subarray(0, 28),
  };
}

const SIGNATURE_LENGTH = 32;

/**
 * AES-128-CBC with a per-request IV (`ivPrefix || int32be(seq)`). Request bodies are
 * `sha256(sig || int32be(seq) || ciphertext) || ciphertext`; response bodies carry the same
 * 32-byte prefix, which python-kasa skips without checking. Seq bookkeeping is the caller's.
 */
export class KlapCipher {
  readonly #initialSeq: number;
  readonly #key: Buffer;
  readonly #ivPrefix: Buffer;
  readonly #sig: Buffer;

  constructor(localSeed: Buffer, remoteSeed: Buffer, authHash: Buffer) {
    const m = deriveKlapMaterial(localSeed, remoteSeed, authHash);
    this.#initialSeq = m.initialSeq;
    this.#key = m.key;
    this.#ivPrefix = m.ivPrefix;
    this.#sig = m.sig;
  }

  /** Seq derived from the IV hash; the first request uses `initialSeq + 1`. */
  get initialSeq(): number {
    return this.#initialSeq;
  }

  encrypt(plaintext: Buffer, seq: number): Buffer {
    const cipher = createCipheriv('aes-128-cbc', this.#key, this.#iv(seq));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const signature = sha256(this.#sig, int32be(seq), ciphertext);
    return Buffer.concat([signature, ciphertext]);
  }

  decrypt(body: Buffer, seq: number): Buffer {
    if (body.length < SIGNATURE_LENGTH + 16) throw new Error(`KLAP body too short (${body.length} bytes)`);
    const decipher = createDecipheriv('aes-128-cbc', this.#key, this.#iv(seq));
    return Buffer.concat([decipher.update(body.subarray(SIGNATURE_LENGTH)), decipher.final()]);
  }

  #iv(seq: number): Buffer {
    return Buffer.concat([this.#ivPrefix, int32be(seq)]);
  }
}

function int32be(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeInt32BE(n);
  return b;
}
