# Waking PCs (Wake-on-LAN)

The app wakes a PC by sending a "magic packet" to its network adapter. The packet is a UDP broadcast to port 9 on the home network. A PC only wakes if it is set up for it. Check each PC once against the list below.

The same steps appear in the app: Admin › Devices › Add PC › "How to set up Wake-on-LAN". Keep the two in step (`apps/web/src/device/computer/WakeSetupChecklist.tsx`).

## Setup checklist (each PC)

1. **BIOS/UEFI:** turn on Wake-on-LAN. It may be called "Wake on LAN", "Power On by PCI-E" or "Resume by LAN". On some boards you also have to turn off "ErP"/"Deep Sleep".
2. **Network adapter (Windows):**
   1. Open Device Manager › Network adapters › your Ethernet adapter › Properties.
   2. On the **Advanced** tab, set **Wake on Magic Packet** to *Enabled*.
   3. On the **Power Management** tab, tick **Allow this device to wake the computer**. Tick **Only allow a magic packet to wake the computer** too.
3. **Turn off Windows Fast Startup:**
   1. Open Control Panel › Power Options › Choose what the power buttons do.
   2. Click Change settings that are currently unavailable, then untick Turn on fast startup.

   With Fast Startup on, "Shut down" is really a hibernate, and many adapters won't wake from it.
4. **Wired and on the same network:** the PC must be connected by Ethernet, on the same subnet as the home server. Wi-Fi adapters generally can't wake a powered-off PC.

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

If you also enter the PC's IP address, the app checks every few seconds whether the PC answers on TCP 445 (file sharing) or 3389 (Remote Desktop). The tile then shows *Online* or *Offline*. Without an IP, the tile shows only **Wake**.

For a reliable status, give the PC a fixed IP: either a DHCP reservation in the router, or a static address.

## Who can wake a PC

- Admins can wake any PC.
- A user can wake a PC only if an admin granted them that PC in the device's Access dialog.
- Guests can never be given a PC.
- The app can't turn PCs off.
