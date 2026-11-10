"""Generate Kasa KLAP golden vectors from python-kasa (the reference implementation).

The whole client flow runs through python-kasa's own code:
  KlapTransport / KlapTransportV2.send()
    -> perform_handshake() -> perform_handshake1() / perform_handshake2()
    -> KlapEncryptionSession.encrypt() / .decrypt()
with the HTTP client replaced by an in-memory fake that records request bodies
and returns canned device responses.  The device responses are themselves made
with python-kasa: handshake1 response = remote_seed + <Transport>.handshake1_seed_auth_hash(),
and the encrypted response body = a second KlapEncryptionSession (same seeds) .encrypt().

Randomness fixed: kasa.transports.klaptransport.secrets.token_bytes(16) -> b"0123456789abcdef".

Usage:  scripts/golden/.venv/Scripts/python scripts/golden/kasa_vectors.py
"""

from __future__ import annotations

import asyncio
import json
import sys
from importlib.metadata import version as pkg_version
from pathlib import Path
from unittest import mock

from kasa import Credentials, DeviceConfig
from kasa.transports import klaptransport as K

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "packages" / "protocols" / "src" / "test" / "fixtures"

USERNAME = "user@example.com"
PASSWORD = "password123"
LOCAL_SEED = b"0123456789abcdef"
REMOTE_SEED = b"fedcba9876543210"
REQUEST = '{"system":{"get_sysinfo":{}}}'
RESPONSE = '{"system":{"get_sysinfo":{"relay_state":1,"err_code":0}}}'


class FakeHttpClient:
    def __init__(self, responses: dict[str, bytes]) -> None:
        self.responses = responses
        self.calls: list[dict] = []

    async def post(self, url, *, params=None, data=None, json=None, headers=None,
                   cookies_dict=None, ssl=False):
        name = url.path.rsplit("/", 1)[-1]
        self.calls.append({"name": name, "params": params, "data": data})
        return 200, self.responses[name]

    def get_cookie(self, name):
        return None

    async def close(self):
        pass


async def gen(variant: str) -> dict:
    cls = K.KlapTransport if variant == "v1" else K.KlapTransportV2
    creds = Credentials(USERNAME, PASSWORD)
    auth_hash = cls.generate_auth_hash(creds)

    # Device side, built with python-kasa's own functions.
    hs1_response = REMOTE_SEED + cls.handshake1_seed_auth_hash(LOCAL_SEED, REMOTE_SEED, auth_hash)
    device_session = K.KlapEncryptionSession(LOCAL_SEED, REMOTE_SEED, auth_hash)
    initial_seq = device_session._seq
    response_body, device_seq = device_session.encrypt(RESPONSE)

    http = FakeHttpClient({"handshake1": hs1_response, "handshake2": b"", "request": response_body})
    transport = cls(config=DeviceConfig(host="127.0.0.1", credentials=creds))
    transport._http_client = http

    with mock.patch.object(K.secrets, "token_bytes", lambda n: LOCAL_SEED if n == 16 else None):
        decoded = await transport.send(REQUEST)

    names = [c["name"] for c in http.calls]
    assert names == ["handshake1", "handshake2", "request"], names
    hs1_req, hs2_req, req = http.calls
    assert hs1_req["data"] == LOCAL_SEED
    session = transport._encryption_session
    seq = req["params"]["seq"]
    assert seq == device_seq == initial_seq + 1

    # ---- self-checks (library round trips)
    assert decoded == json.loads(RESPONSE), decoded  # client decrypted device response
    assert transport._local_auth_hash == auth_hash
    check = K.KlapEncryptionSession(LOCAL_SEED, REMOTE_SEED, auth_hash)
    check._seq = seq
    check._generate_cipher()
    assert check.decrypt(req["data"]) == REQUEST  # device-side decrypt of client request
    import hashlib
    sig = hashlib.sha256(session._sig + K.PACK_SIGNED_LONG(seq) + req["data"][32:]).digest()
    assert sig == req["data"][:32]

    return {
        "variant": variant,
        "username": USERNAME,
        "password": PASSWORD,
        "localSeedHex": LOCAL_SEED.hex(),
        "remoteSeedHex": REMOTE_SEED.hex(),
        "authHashHex": auth_hash.hex(),
        "handshake1ResponseHex": hs1_response.hex(),
        "handshake2Hex": hs2_req["data"].hex(),
        "keyHex": session._key.hex(),
        "ivHex": session._iv.hex(),
        "initialSeq": initial_seq,
        "seq": seq,
        "sigHex": session._sig.hex(),
        "plaintext": REQUEST,
        "requestBodyHex": req["data"].hex(),
        "responsePlaintext": RESPONSE,
        "responseBodyHex": response_body.hex(),
    }


def main() -> int:
    vectors = [asyncio.run(gen("v1")), asyncio.run(gen("v2"))]
    for v in vectors:
        for k, val in v.items():
            if k.endswith("Hex"):
                assert isinstance(val, str) and val, f"empty {k} ({v['variant']})"
    FIXTURES.mkdir(parents=True, exist_ok=True)
    (FIXTURES / "kasa-vectors.json").write_text(json.dumps(vectors, indent=2) + "\n", encoding="utf-8")
    print(f"python-kasa {pkg_version('python-kasa')}: wrote {len(vectors)} kasa vectors, all self-checks passed")
    for v in vectors:
        print(f"  {v['variant']} seq={v['seq']} key={v['keyHex']} req={len(v['requestBodyHex'])//2}B")
    return 0


if __name__ == "__main__":
    sys.exit(main())
