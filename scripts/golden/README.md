# Golden vectors

Generates the byte-level fixtures in `packages/protocols/src/test/fixtures/` from the
reference libraries. The TypeScript clients must reproduce these bytes exactly. Never edit
the JSON by hand: rerun the scripts instead.

## Library versions used

| Package | Version |
|---|---|
| Python | 3.13.5 |
| tinytuya | 1.20.0 |
| python-kasa | 0.12.0 |
| cryptography (AES backend for both) | 50.0.2 |

## Regenerate

```sh
python -m venv scripts/golden/.venv
scripts/golden/.venv/Scripts/python -m pip install -r scripts/golden/requirements.txt
scripts/golden/.venv/Scripts/python scripts/golden/tuya_vectors.py   # tuya-vectors.json, tuya-cloud-sign.json
scripts/golden/.venv/Scripts/python scripts/golden/kasa_vectors.py   # kasa-vectors.json
```

Each script checks its own output before writing it. It round-trips every frame through the
library's own decoders, checks that every `*Hex` field is non-empty, and stops with an error
if any check fails.

## Fixed inputs

- Tuya local key `0123456789abcdef`, device id `device0123456789abcd`, `time.time()` = `1700000000`.
- Tuya session nonces: local `0123456789abcdef` (from patched `os.urandom(16)`), remote `fedcba9876543210`.
- Tuya 3.5 GCM IVs: client frames `0123456789ab` (from patched `os.urandom(12)`), device RESP `ba9876543210`.
- Data frames use seq 1. The handshake uses START seq 1, RESP seq 1 and FINISH seq 2.
- Kasa: user `user@example.com`, password `password123`, local seed `0123456789abcdef`
  (from patched `secrets.token_bytes(16)`), remote seed `fedcba9876543210`.

## Fixture notes

`tuya-vectors.json` is an array. Each entry has the shape in the plan, plus these fields:
- `kind` is one of `DP_QUERY`, `CONTROL`, `SESS_KEY_NEG_START`, `SESS_KEY_NEG_RESP` or `SESS_KEY_NEG_FINISH`.
- `direction` is `client` or `device`. Only the RESP entry is `device`.
- `payloadHex` holds the exact plaintext bytes. For handshake entries `payload` is `null`.
- `ivHex` is the GCM IV for 3.5 frames.
- `payload` is the object that `XenonDevice.generate_payload()` builds. So `cmd` is the command
  that goes on the wire: 3.4/3.5 send `DP_QUERY` as 16 (`DP_QUERY_NEW`) and `CONTROL` as 13
  (`CONTROL_NEW`). Serialize `payload` with `JSON.stringify` (no spaces, insertion order) to get
  `payloadHex`.
- The 3.4/3.5 `DP_QUERY` and `CONTROL` frames, and the `sessionKeyHex` field, use the
  negotiated session key. The handshake frames use `localKey`.
- Client 55AA frames carry no retcode. Device frames carry a 4-byte retcode of 0. For 3.4 the
  retcode sits before the ECB ciphertext. For 3.5 it is inside the GCM plaintext.

`kasa-vectors.json` is an array with one entry per auth variant: `variant` `"v1"` (`KlapTransport`,
md5) and `"v2"` (`KlapTransportV2`, sha256/sha1). Fields added to the plan's shape:
- `handshake1ResponseHex` is the device's handshake1 reply: remote seed followed by the server hash.
- `initialSeq` is the seq derived from the IV hash. `seq` is the seq for the first request, `initialSeq + 1`.
- `responsePlaintext` is the plaintext of `responseBodyHex`.
- `ivHex` is the 12-byte IV prefix. The CBC IV is `ivHex || int32be(seq)`.
- `seq` is a signed int32 and may be negative.

`tuya-cloud-sign.json` is an array of signatures made by tinytuya's `Cloud._tuyaplatform()`, using
the new sign algorithm:
- `[0]` is the token request (`Cloud._gettoken`). Its `accessToken` is `""`.
- `[1]` is a business request, `GET /v1.0/users/abc/devices`, signed with `accessToken` `"tok"`.

The string that gets signed is `accessId + accessToken + t + nonce + stringToSign`.
