# Waking PCs (Wake-on-LAN)

The app wakes a PC by sending a "magic packet" to its network adapter. The packet is a UDP broadcast to port 9 on the home network. A PC only wakes if it is set up for it. Check each PC once against the list below.

To also sleep, shut down or restart a PC and see its live stats, install the HomeAgent on it: [HOME-AGENT.md](HOME-AGENT.md).

The same steps appear in the app: Admin › Devices › Add PC › "How to set up Wake-on-LAN". Keep the two in step (`apps/web/src/device/computer/wakeSetupSteps.ts`).

## Setup checklist (each PC)

1. **Network adapter (Windows):**
   1. Open Device Manager › Network adapters › your Ethernet adapter › Properties.
   2. On the **Power Management** tab, tick **Allow this device to wake the computer**. Tick **Only allow a magic packet to wake the computer** too.
   3. On the **Advanced** tab, check that **Enable PME** is *Enabled*, and set **Wake on Magic Packet** to *Enabled*. (Not every adapter lists both; set whichever ones are there.)
2. **BIOS/UEFI:** restart into the BIOS and turn on the motherboard's wake-from-network setting. The name depends on the maker:

   | Motherboard | Setting to turn on |
   | --- | --- |
   | ASUS | Advanced › APM › **Power On By PCI-E** |
   | MSI | Settings › Advanced › Wake Up Event Setup › **Resume By PCI-E Device** |
   | Gigabyte | Settings › Platform Power › **Wake on LAN** |
   | ASRock | Advanced › ACPI Configuration › **PCIE Devices Power On** |
   | Dell / HP / Lenovo | Power Management › **Wake on LAN** |

   On many boards you also have to turn **off** "ErP Ready" / "Deep Sleep" / "EuP", or the network adapter loses power when the PC is off.
3. **Turn off Windows Fast Startup:**
   1. Open Control Panel › Power Options › Choose what the power buttons do.
   2. Click Change settings that are currently unavailable, then untick Turn on fast startup.

   With Fast Startup on, "Shut down" is really a hibernate, and many adapters won't wake from it.
4. **Wired and on the same network:** the PC must be connected by Ethernet, on the same subnet as the home server. Wi-Fi adapters generally can't wake a powered-off PC.
5. **Let the home server see the PC:** allow port 445 (or Remote Desktop) from the server, so the app can tell On from Off and keep the PC's history. See [Online status](#online-status-optional-ip).

## Finding the MAC address

On the PC, open Command Prompt and run either:

```
getmac /v
```

```
ipconfig /all
```

Use the **Physical Address** of the *Ethernet* adapter, not Wi-Fi or a virtual adapter. Enter it in any common notation: `AA-BB-CC-DD-EE-FF`, `aa:bb:cc:dd:ee:ff` or `aabbccddeeff`.

## Online status (optional IP)

If you also enter the PC's IP address, the server checks every few seconds whether the PC answers on TCP 445 (file sharing), 3389 (Remote Desktop) or 22 (SSH). The tile then shows *On* or *Off*.

For a reliable status, give the PC a fixed IP: either a DHCP reservation in the router, or a static address.

**Confirmable PCs.** A firewalled PC never answers, so the server can't tell *Off* from *blocked*. Until one of those ports has answered at least once, the PC is not *confirmable*:

- its status reads **Status unknown** instead of *Off*;
- a wake ends as **Wake sent, can't confirm** instead of *Didn't wake*;
- no On/Off history is kept or shown.

A PC without an IP is never confirmable. Once a port has answered, the server remembers it, and from then on a silent PC really is off.

Windows blocks port 445 on networks set to *Public*. To let only the home server through, run this once in an **admin** PowerShell on the PC (change the address if your server's IP differs):

```powershell
New-NetFirewallRule -DisplayName "Home server presence check (SMB)" -Direction Inbound -Protocol TCP -LocalPort 445 -RemoteAddress 192.168.0.100 -Action Allow
```

Turning on Remote Desktop works too, and also enables the **Remote Desktop** button.

## After a wake

The server follows each wake for up to 2 minutes, checking every 3 seconds. The tile and the PC's page show *Waking…*, then *On after 23 s* or *Didn't wake* (with a link to the setup checklist for admins). The result stays for a minute.

## Remote Desktop

Once the server has seen the PC answer on 3389, the PC's page shows a **Remote Desktop** button. It wakes the PC if needed, waits for it, then opens Remote Desktop:

- **On a PC with the HomeAgent** Remote Desktop Connection opens directly. The agent registers a `home-rdp://` link type; the first time, the browser asks to open it (tick *Always allow*). The server knows the browser is on an agent PC from the request's IP, so the PC's IP in the app must be current. Links only open PCs at private IPv4 addresses.
- **In any other browser** a `<PC name>.rdp` file downloads; open it and Windows' built-in Remote Desktop Connection connects (Windows may warn about the file's unknown publisher).
- **In the Android app** the file goes straight to the phone's Remote Desktop app (Microsoft's *Windows App*). If none is installed, the app says so.

Sign in with the PC's Windows account (for a Microsoft account, its email and password; a PIN doesn't work over Remote Desktop). Remote Desktop needs Windows **Pro** on the PC.

## History

For confirmable PCs, every On/Off change is kept for 30 days. The PC's page shows *On since 18:42* / *Last on Yesterday 23:10* and a 24 h / 7 day timeline.

## Who can wake a PC

- Admins can wake any PC.
- A user can wake a PC only if an admin granted them that PC in the device's Access dialog.
- Guests can never be given a PC.
- The app can't turn PCs off without the HomeAgent. With it, it can also sleep, shut down and restart them: see [HOME-AGENT.md](HOME-AGENT.md).

## TVs

Samsung and Android/Google TVs are woken with the same magic packet. Nothing needs to be entered by hand. The app learns a TV's MAC address from the server's ARP table the first time it sees the TV turned on (Samsung TVs also report it themselves).

- **On the TV:** turn on Wake-on-LAN / Wake-on-Wi-Fi (sometimes called "Network standby"). Without it, a TV in deep standby can't be reached.
- **Android/Google TVs:** while the TV keeps its remote connection in light standby, the app turns it on with the POWER key. Once the connection drops, the TV shows as *Off* (not *Offline*) if its MAC is known. Turning it on then sends the magic packet and reconnects. If the TV wakes only its network and leaves the screen off, the app presses POWER once it reconnects (within 2 minutes of the request).
- A TV whose MAC was never learned still shows *Offline* while unreachable. Turn it on once by hand while the server is running, and wait for discovery (about a minute).
