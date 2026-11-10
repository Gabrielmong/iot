"""Generate Tuya golden vectors from tinytuya (the reference implementation).

Every byte in the output is produced by tinytuya's own code paths:
  - client frames: XenonDevice.generate_payload() + XenonDevice._encode_message()
    (which calls tinytuya.core.message_helper.pack_message)
  - 3.4/3.5 handshake: XenonDevice._negotiate_session_key() run end-to-end
    against an in-memory fake socket (step_1 / step_3 / finalize)
  - device SESS_KEY_NEG_RESP: built with tinytuya's pack_message + AESCipher
    using the real local key (the device side is not implemented by tinytuya)
  - cloud signing: Cloud._gettoken() -> Cloud._tuyaplatform() (token request) and
    Cloud(initial_token="tok")._tuyaplatform("users/abc/devices") (business request), with
    requests.get intercepted to capture the signed headers

Randomness / clocks are fixed by monkeypatching:
  - os.urandom(16) -> local nonce b"0123456789abcdef" (session key negotiation)
  - os.urandom(12) -> GCM IV b"0123456789ab" (3.5 client frames)
  - time.time()   -> 1700000000.0

Usage:  scripts/golden/.venv/Scripts/python scripts/golden/tuya_vectors.py
"""

from __future__ import annotations

import json
import os
import struct
import sys
from pathlib import Path
from unittest import mock

import importlib

import tinytuya
from tinytuya.core import command_types as CT
from tinytuya.core import header as H
from tinytuya.core.crypto_helper import AESCipher
from tinytuya.core.message_helper import (
    MessagePayload,
    TuyaMessage,
    pack_message,
    unpack_message,
)

Cloud = importlib.import_module("tinytuya.Cloud")  # the module, not the class
XD_MOD = importlib.import_module("tinytuya.core.XenonDevice")  # the module, not the class

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "packages" / "protocols" / "src" / "test" / "fixtures"

DEV_ID = "device0123456789abcd"
LOCAL_KEY = "0123456789abcdef"
LOCAL_NONCE = b"0123456789abcdef"
REMOTE_NONCE = b"fedcba9876543210"
CLIENT_GCM_IV = b"0123456789ab"   # 12-byte IV for client 3.5 frames
DEVICE_GCM_IV = b"ba9876543210"   # 12-byte IV for the device's 3.5 RESP frame
FIXED_TIME = 1700000000.0
SEQ = 1
DPS = {"20": True}

KIND_BY_CMD = {
    CT.SESS_KEY_NEG_START: "SESS_KEY_NEG_START",
    CT.SESS_KEY_NEG_RESP: "SESS_KEY_NEG_RESP",
    CT.SESS_KEY_NEG_FINISH: "SESS_KEY_NEG_FINISH",
}


def fake_urandom(n: int) -> bytes:
    if n == 16:
        return LOCAL_NONCE
    if n == 12:
        return CLIENT_GCM_IV
    raise AssertionError(f"unexpected os.urandom({n})")


class FakeSocket:
    """Records what tinytuya sends; replays queued device bytes on recv()."""

    def __init__(self) -> None:
        self.sent: list[bytes] = []
        self.inbox = b""

    def sendall(self, data: bytes) -> None:
        self.sent.append(bytes(data))

    def recv(self, n: int) -> bytes:
        out, self.inbox = self.inbox[:n], self.inbox[n:]
        return out

    def close(self) -> None:
        pass

    def setsockopt(self, *a) -> None:
        pass

    def settimeout(self, *a) -> None:
        pass


def make_device(version: float) -> XD_MOD.XenonDevice:
    return XD_MOD.XenonDevice(DEV_ID, address="127.0.0.1", local_key=LOCAL_KEY, version=version)


def device_resp_frame(version: float) -> bytes:
    """Device side of step 2, built with tinytuya's own primitives and the real key."""
    key = LOCAL_KEY.encode("latin1")
    import hmac
    from hashlib import sha256

    body = REMOTE_NONCE + hmac.new(key, LOCAL_NONCE, sha256).digest()
    if version == 3.4:
        # 55AA frame: retcode(4) + AES-ECB(body, PKCS7) ; HMAC-SHA256 trailer
        enc = AESCipher(key).encrypt(body, False)
        msg = TuyaMessage(SEQ, CT.SESS_KEY_NEG_RESP, 0, struct.pack(H.MESSAGE_RETCODE_FMT, 0) + enc,
                          0, True, H.PREFIX_55AA_VALUE, None)
        return pack_message(msg, hmac_key=key)
    # 3.5: 6699 frame, retcode inside the GCM plaintext
    msg = TuyaMessage(SEQ, CT.SESS_KEY_NEG_RESP, 0, body, 0, True, H.PREFIX_6699_VALUE, DEVICE_GCM_IV)
    return pack_message(msg, hmac_key=key)


def data_frames(dev: XD_MOD.XenonDevice, version: str, extra: dict) -> list[dict]:
    out = []
    for kind, cmd, data in (("DP_QUERY", CT.DP_QUERY, None), ("CONTROL", CT.CONTROL, DPS)):
        mp = dev.generate_payload(cmd, data)
        dev.seqno = SEQ
        frame = dev._encode_message(mp)
        entry = {
            "version": version,
            "kind": kind,
            "direction": "client",
            "localKey": LOCAL_KEY,
            "seq": SEQ,
            "cmd": mp.cmd,
            "payload": json.loads(mp.payload.decode()),
            "payloadHex": mp.payload.hex(),
            "frameHex": frame.hex(),
        }
        if version == "3.5":
            entry["ivHex"] = CLIENT_GCM_IV.hex()
        entry.update(extra)
        out.append(entry)
    return out


def gen_plain(version: float) -> list[dict]:
    dev = make_device(version)
    return data_frames(dev, str(version), {})


def gen_session(version: float) -> list[dict]:
    vs = str(version)
    dev = make_device(version)
    sock = FakeSocket()
    resp = device_resp_frame(version)
    sock.inbox = resp
    dev.socket = sock
    dev._get_socket = lambda renew: True  # socket already "connected"
    dev.seqno = SEQ
    assert dev._negotiate_session_key() is True, "tinytuya rejected the handshake"
    assert len(sock.sent) == 2, sock.sent
    session_key = dev.local_key
    assert len(session_key) == 16

    nonces = {"localNonceHex": LOCAL_NONCE.hex(), "remoteNonceHex": REMOTE_NONCE.hex()}
    start_payload = LOCAL_NONCE
    import hmac
    from hashlib import sha256
    finish_payload = hmac.new(LOCAL_KEY.encode(), REMOTE_NONCE, sha256).digest()
    resp_payload = REMOTE_NONCE + hmac.new(LOCAL_KEY.encode(), LOCAL_NONCE, sha256).digest()

    def hs(kind, direction, seq, cmd, payload, frame, iv, with_key=False):
        e = {"version": vs, "kind": kind, "direction": direction, "localKey": LOCAL_KEY,
             "seq": seq, "cmd": cmd, "payload": None, "payloadHex": payload.hex(),
             "frameHex": frame.hex(), **nonces}
        if version == 3.5:
            e["ivHex"] = iv.hex()
        if with_key:
            e["sessionKeyHex"] = session_key.hex()
        return e

    entries = [
        hs("SESS_KEY_NEG_START", "client", SEQ, CT.SESS_KEY_NEG_START, start_payload, sock.sent[0], CLIENT_GCM_IV),
        hs("SESS_KEY_NEG_RESP", "device", SEQ, CT.SESS_KEY_NEG_RESP, resp_payload, resp, DEVICE_GCM_IV),
        hs("SESS_KEY_NEG_FINISH", "client", SEQ + 1, CT.SESS_KEY_NEG_FINISH, finish_payload, sock.sent[1],
           CLIENT_GCM_IV, with_key=True),
    ]
    entries += data_frames(dev, vs, {"sessionKeyHex": session_key.hex(), **nonces})
    return entries


# ---------------------------------------------------------------- self-check
def check_entry(e: dict) -> None:
    for k, v in e.items():
        if k.endswith("Hex"):
            assert isinstance(v, str) and v, f"empty {k} in {e['version']} {e['kind']}"
    frame = bytes.fromhex(e["frameHex"])
    real_key = e["localKey"].encode()
    v = e["version"]
    is_hs = e["kind"].startswith("SESS_KEY")
    key = bytes.fromhex(e["sessionKeyHex"]) if ("sessionKeyHex" in e and not is_hs) else real_key
    hmac_key = key if v in ("3.4", "3.5") else None
    client = e["direction"] == "client"
    msg = unpack_message(frame, hmac_key=hmac_key, no_retcode=client)
    assert msg.crc_good, f"bad crc/tag {v} {e['kind']}"
    assert msg.seqno == e["seq"] and msg.cmd == e["cmd"], (v, e["kind"])
    payload = msg.payload
    hdr = (v.encode() + H.PROTOCOL_3x_HEADER)
    if v == "3.1":
        if e["cmd"] == CT.CONTROL:
            assert payload[:3] == b"3.1"
            payload = AESCipher(key).decrypt(payload[19:], use_base64=True, decode_text=False)
    elif v == "3.3":
        if payload.startswith(hdr):
            payload = payload[len(hdr):]
        payload = AESCipher(key).decrypt(payload, False, decode_text=False)
    elif v == "3.4":
        payload = AESCipher(key).decrypt(payload, False, decode_text=False)
        if payload.startswith(hdr):
            payload = payload[len(hdr):]
    elif v == "3.5":
        if payload.startswith(hdr):
            payload = payload[len(hdr):]
        assert msg.iv.hex() == e["ivHex"]
    assert payload == bytes.fromhex(e["payloadHex"]), f"round-trip mismatch {v} {e['kind']}: {payload!r}"
    if e.get("payload") is not None:
        assert json.dumps(e["payload"], separators=(",", ":")).encode() == payload


def gen_cloud() -> list[dict]:
    """Two signatures from tinytuya's Cloud._tuyaplatform():
    [0] token request (no access token, via Cloud._gettoken),
    [1] business request signed with access token "tok"."""
    captured: list[dict] = []

    class Resp:
        status_code = 200
        text = '{"success":true}'
        content = json.dumps({"success": True, "t": 1700000000000,
                              "result": {"access_token": "tok", "uid": "u"}}).encode()

    def fake_get(url, headers=None, **kw):
        captured.append({"url": url, "headers": dict(headers)})
        return Resp()

    with mock.patch.object(Cloud.requests, "get", fake_get),          mock.patch.object(Cloud.time, "time", lambda: FIXED_TIME):
        # 1) token request: constructor with no token calls _gettoken()
        Cloud.Cloud(apiRegion="us", apiKey="id", apiSecret="secret")
        # 2) business request: start with an existing access token, then GET users/abc/devices
        c = Cloud.Cloud(apiRegion="us", apiKey="id", apiSecret="secret", initial_token="tok")
        c._tuyaplatform("users/abc/devices", action="GET")

    assert len(captured) == 2, captured
    out = []
    for cap, token, path in ((captured[0], "", "/v1.0/token?grant_type=1"),
                             (captured[1], "tok", "/v1.0/users/abc/devices")):
        h = cap["headers"]
        assert h["t"] == "1700000000000" and h["client_id"] == "id"
        assert cap["url"].endswith(path), cap["url"]
        assert h.get("access_token", "") == token, h
        out.append({"accessId": "id", "accessSecret": "secret", "accessToken": token, "t": h["t"],
                    "nonce": "", "method": "GET", "path": path, "body": "", "sign": h["sign"]})
    return out


def check_cloud(c: dict) -> None:
    # Independent recomputation per Tuya's documented string-to-sign (sanity, not the source).
    import hashlib, hmac
    sts = "\n".join([c["method"], hashlib.sha256(c["body"].encode()).hexdigest(), "", c["path"]])
    want = hmac.new(c["accessSecret"].encode(),
                    (c["accessId"] + c["accessToken"] + c["t"] + c["nonce"] + sts).encode(),
                    hashlib.sha256).hexdigest().upper()
    assert want == c["sign"], (want, c["sign"])


def main() -> int:
    FIXTURES.mkdir(parents=True, exist_ok=True)
    with mock.patch.object(os, "urandom", fake_urandom), \
         mock.patch.object(XD_MOD.time, "time", lambda: FIXED_TIME), \
         mock.patch.object(XD_MOD.time, "sleep", lambda s: None):
        vectors = gen_plain(3.1) + gen_plain(3.3) + gen_session(3.4) + gen_session(3.5)
    for e in vectors:
        check_entry(e)
    cloud = gen_cloud()
    for c in cloud:
        check_cloud(c)

    (FIXTURES / "tuya-vectors.json").write_text(json.dumps(vectors, indent=2) + "\n", encoding="utf-8")
    (FIXTURES / "tuya-cloud-sign.json").write_text(json.dumps(cloud, indent=2) + "\n", encoding="utf-8")
    print(f"tinytuya {tinytuya.__version__}: wrote {len(vectors)} tuya vectors, all self-checks passed")
    for e in vectors:
        print(f"  {e['version']} {e['kind']:<20} {e['direction']:<6} cmd={e['cmd']:<2} seq={e['seq']} frame={len(e['frameHex'])//2}B")
    for c in cloud:
        print(f"  cloud {c['path']:<28} token={c['accessToken']!r:<6} sign={c['sign']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
