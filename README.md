# Home

A home control app for a home network. It runs on an always-on PC, and phones and a wall tablet open it in the browser to control lights, plugs and cameras. No vendor apps or cloud are needed for day-to-day use.

## What it does

- **Dashboard:** device tiles with on/off, brightness and colour. You can arrange and resize them, and each user can keep their own layout.
- **Cameras:** live view (WebRTC via go2rtc), thumbnails, and multi-camera views.
- **Routines:** run several device actions with one tap or on a schedule. **All off** is one of them.
- **Users:** sign-in with a PIN, admin and regular roles, and per-device access. Each user has a profile with a name, picture and colour.
- **Shared screens:** a wall tablet mode that signs out after 3 minutes idle.
- **Admin:** adopt devices, store integration credentials (encrypted at rest) and sync Tuya keys. Key syncs also run on a schedule.

### Supported devices

| Brand | How | Notes |
| --- | --- | --- |
| Tuya / Smart Life bulbs and plugs | Local LAN protocol (3.1–3.5) | Local keys come from a Tuya IoT cloud project |
| TP-Link Kasa (KP303) | Local LAN | Needs TP-Link account credentials |
| Govee | LAN Control (UDP) | LAN Control must be on in the Govee app |
| Swann recorder | RTSP via go2rtc | |
| Tuya cloud cameras | Tuya cloud streams | Need internet access |

## Stack

A TypeScript pnpm monorepo:

- `apps/server`: Node 22, Express, Apollo Server (GraphQL, with subscriptions over WebSocket), and Prisma on PostgreSQL.
- `apps/web`: React 19, Vite, MUI and Apollo Client. In production the server serves the built app.
- `packages/protocols`: device protocol clients (Tuya, Kasa, Govee, ONVIF, RTSP, Swann) and the Tuya cloud client.

## Development

Prerequisites: Node 22+, pnpm and PostgreSQL.

```powershell
pnpm install
copy .env.example .env      # then fill it in (see docs/RUNNING.md, section 2)
pnpm db:deploy              # apply database migrations
pnpm dev                    # server on :4000, web on Vite's dev port (proxies /graphql and /api)
```

On the first start with an empty database, sign in as **Admin** with the `BOOTSTRAP_ADMIN_PIN` you set in `.env`.

Other scripts:

- `pnpm test`: runs all package tests (Vitest). Server tests use `DATABASE_URL_TEST`.
- `pnpm build`: builds the protocols, server and web packages.
- `pnpm --filter @home/server db:migrate`: creates a new Prisma migration.

## Running it for real

[docs/RUNNING.md](docs/RUNNING.md) covers installing on the server PC as a Windows service, firewall rules, connecting each device brand, the acceptance checklist and troubleshooting.

To deploy each green commit automatically from a private GitHub repo, see "Deploying automatically" in that file.

## Docs

- `docs/superpowers/specs/`: design documents, one per feature.
- `docs/superpowers/plans/`: implementation plans.
- [docs/NICE-TO-HAVES.md](docs/NICE-TO-HAVES.md): ideas parked for later.
