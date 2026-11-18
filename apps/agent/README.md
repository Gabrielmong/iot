# HomeAgent

A small Windows service that lets the home-control app sleep, shut down and restart this PC (behind a cancellable
60-second prompt) and show its live stats. It dials **out** to the server over a WebSocket, so the PC needs no
firewall change. See `docs/HOME-AGENT.md` for what it does on a PC and how to remove it.

## Layout

| Package | Does |
|---|---|
| `internal/trailer` | Reads the server URL + one-time code appended to a downloaded exe |
| `internal/state` | `C:\ProgramData\HomeAgent\agent.json` (server, device id, token); the folder is SYSTEM + Administrators only |
| `internal/netinfo` | Picks the wake MAC, real MACs and IPs (skips Hyper-V, WSL, VPN, loopback…) |
| `internal/protocol` | The v1 wire protocol (closed message set, mirrors `apps/server/src/agent/protocol.ts`) |

Windows-only code lives in `*_windows.go`; everything else is tested on any OS.

## Develop

```bash
cd apps/agent
go test ./...
GOOS=windows go vet ./...
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -ldflags "-s -w" -o HomeAgent.exe ./cmd/homeagent
```
