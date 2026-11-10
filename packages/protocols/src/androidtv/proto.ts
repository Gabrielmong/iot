/*
 * Android TV Remote v2 message definitions, transcribed (trimmed to the messages this app uses) from
 * pairingmessage.proto and remotemessage.proto in the `androidtv-remote` npm package
 * (https://github.com/louis49/androidtv-remote), MIT License, Copyright (c) 2021 louis49.
 *
 * Kept as strings parsed at load time, so the build has no .proto assets to copy. Field numbers are the
 * wire contract; key codes are plain varints here (the upstream RemoteKeyCode enum is just their names).
 */

export const PAIRING_PROTO = `
syntax = "proto3";
package pairing;

enum RoleType {
  ROLE_TYPE_UNKNOWN = 0;
  ROLE_TYPE_INPUT = 1;
  ROLE_TYPE_OUTPUT = 2;
}

message PairingRequest {
  string service_name = 1;
  string client_name = 2;
}

message PairingRequestAck {
  string server_name = 1;
}

message PairingEncoding {
  enum EncodingType {
    ENCODING_TYPE_UNKNOWN = 0;
    ENCODING_TYPE_ALPHANUMERIC = 1;
    ENCODING_TYPE_NUMERIC = 2;
    ENCODING_TYPE_HEXADECIMAL = 3;
    ENCODING_TYPE_QRCODE = 4;
  }
  EncodingType type = 1;
  uint32 symbol_length = 2;
}

message PairingOption {
  repeated PairingEncoding input_encodings = 1;
  repeated PairingEncoding output_encodings = 2;
  RoleType preferred_role = 3;
}

message PairingConfiguration {
  PairingEncoding encoding = 1;
  RoleType client_role = 2;
}

message PairingConfigurationAck {}

message PairingSecret {
  bytes secret = 1;
}

message PairingSecretAck {
  bytes secret = 1;
}

message PairingMessage {
  int32 protocol_version = 1;
  int32 status = 2;
  int32 request_case = 3;
  PairingRequest pairing_request = 10;
  PairingRequestAck pairing_request_ack = 11;
  PairingOption pairing_option = 20;
  PairingConfiguration pairing_configuration = 30;
  PairingConfigurationAck pairing_configuration_ack = 31;
  PairingSecret pairing_secret = 40;
  PairingSecretAck pairing_secret_ack = 41;
}
`;

export const REMOTE_PROTO = `
syntax = "proto3";
package remote;

message RemoteDeviceInfo {
  string model = 1;
  string vendor = 2;
  int32 unknown1 = 3;
  string unknown2 = 4;
  string package_name = 5;
  string app_version = 6;
}

message RemoteConfigure {
  int32 code1 = 1;
  RemoteDeviceInfo device_info = 2;
}

message RemoteSetActive {
  int32 active = 1;
}

message RemoteError {
  bool value = 1;
}

message RemotePingRequest {
  int32 val1 = 1;
  int32 val2 = 2;
}

message RemotePingResponse {
  int32 val1 = 1;
}

message RemoteKeyInject {
  int32 key_code = 1;
  int32 direction = 2;
}

message RemoteStart {
  bool started = 1;
}

message RemoteAppLinkLaunchRequest {
  string app_link = 1;
}

message RemoteMessage {
  RemoteConfigure remote_configure = 1;
  RemoteSetActive remote_set_active = 2;
  RemoteError remote_error = 3;
  RemotePingRequest remote_ping_request = 8;
  RemotePingResponse remote_ping_response = 9;
  RemoteKeyInject remote_key_inject = 10;
  RemoteStart remote_start = 40;
  RemoteAppLinkLaunchRequest remote_app_link_launch_request = 90;
}
`;
