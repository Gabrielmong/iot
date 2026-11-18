# HomeAgent (PC agent)

HomeAgent is a small Windows service you install on a PC that the app manages. With it, the app can:

- put the PC to **sleep**, **shut it down** or **restart** it, from the PC's page or (sleep and shut down only) from a routine;
- show the PC's **live stats**: CPU, RAM, GPU load and temperature (NVIDIA), free disk space per drive, network speed, uptime, and who is signed in;
- know the PC is **On** while the agent is connected, even if the PC's firewall blocks the usual status checks.

Waking a PC still works through Wake-on-LAN (see [WAKE-ON-LAN.md](WAKE-ON-LAN.md)). The agent can't wake a PC that is asleep or off, because it isn't running then.

The agent only does what the app can ask of it: sleep, shut down, restart, cancel, send stats, update itself and uninstall. It also opens Remote Desktop links on the PC it runs on. It can't run arbitrary commands.

## Adopting a PC

Do this **on the PC you want to add**, signed in to the app as an admin.

1. Open the app in a browser on that PC: **Admin › Devices › Adopt this PC**, then **Download the agent**.
2. Run the downloaded `HomeAgent-….exe` and accept the Windows admin prompt (UAC).
3. **SmartScreen:** the agent isn't code-signed, so Windows may show "Windows protected your PC". Click **More info**, then **Run anyway**.
4. A message confirms the install. The PC appears in Devices within a few seconds and shows *On*.

Notes:

- A download works **once** and expires after **30 minutes**. If it says the download was already used or expired, download it again from the app.
- If the PC was already in the app as a Wake-on-LAN PC, the agent attaches to it (matched by MAC address) and keeps its name, room and access settings. Otherwise a new PC is created, named after the computer's name.
- Running a new download on a PC that already has the agent pairs it again (the old pairing stops working).
- The agent installs to `C:\Program Files\HomeAgent\` and keeps its pairing in `C:\ProgramData\HomeAgent\agent.json` (readable only by SYSTEM and Administrators). It runs as the `HomeAgent` service and starts with Windows.

## Permissions

Admins can do everything. For other users, an admin opens the PC's **Access** dialog (Admin › Devices) and ticks, per user:

- **Live stats**: the user sees the stats card on the PC's page.
- **Power actions**: the user sees Sleep · Shut down · Restart on the PC's page, and can use Sleep or Shut down for that PC in their routines.

Both need the PC itself to be granted. Guests can never be given a PC.

## Sleep, shut down, restart

- **Someone is signed in and the screen is unlocked:** they see a 60-second warning ("‹Name› is restarting this PC") with **Cancel** and **Do it now**. If they cancel, the person who asked sees "Restart cancelled at the PC". When the time runs out, open apps are closed without asking.
- **Nobody signed in, or the PC is locked:** it happens straight away.
- Routines can put a PC to sleep or shut it down, not restart it. The warning names the routine ("Routine Bedtime").
- The power buttons appear only while the agent is connected.

## Live stats

Stats are only collected while someone has the PC's page open (every 2 seconds). Nothing is stored. Collection stops about 10 seconds after the last viewer leaves.

## Remote Desktop links

The agent registers a `home-rdp://` link type on the PC each time its service starts. The app's **Remote Desktop** button uses it, so on this PC the button opens Remote Desktop Connection directly instead of downloading a `.rdp` file. The link only accepts a bare private IPv4 address (no names, ports or options) and just runs `mstsc /v:<ip>`. See [WAKE-ON-LAN.md](WAKE-ON-LAN.md#remote-desktop).

## Updates

New versions are published by the `Agent` GitHub workflow and picked up by the server on deploy (see [RUNNING.md](RUNNING.md) §10). An agent updates itself the next time it connects. The update is checked against its SHA-256 before it is installed. The service restarts itself during an update, and you don't need to do anything.

To see whether a PC has updated, open it in the app: the **Admin** card shows its version, e.g. *HomeAgent v1012 · up to date*, *· updating to v1013*, or *· updates to v1013 when it next connects*. On the PC, Event Viewer › Windows Logs › Application (source **HomeAgent**) logs *HomeAgent v1012 started* each time the service starts.

## Removing it

- **From the app:** Admin › Devices › Remove on the PC. The agent uninstalls itself: at once if it's connected, otherwise the next time it connects (for up to 90 days).
- **On the PC:** run `"C:\Program Files\HomeAgent\HomeAgent.exe" uninstall` and accept the admin prompt.

Both remove the service, the `home-rdp://` link type and the files in Program Files and ProgramData.

## How light it is

Targets: under **20 MB** of RAM and about **0 % CPU** when idle, and under **10 MB** on disk. Collecting live stats uses a little more, and only while someone is watching.

## Troubleshooting

- **Logs:** Event Viewer › Windows Logs › **Application**, source **`HomeAgent`**. Connection problems, failed updates and power actions are logged there.
- **The PC shows Off while it's on:** check that the `HomeAgent` service is running (`services.msc`). The agent retries the connection on its own (from every second up to once a minute), for example after the server restarts.
- **"server rejected the agent token"** in the log: the server no longer recognises this PC's pairing (for example after a database restore). The agent tries again once an hour and never uninstalls itself for this reason. Adopt the PC again to fix it.
- **The power buttons are missing:** the agent isn't connected, or you don't have *Power actions* for this PC.
- **No GPU in the stats:** GPU stats need an NVIDIA card and driver. Other GPUs are left out.
