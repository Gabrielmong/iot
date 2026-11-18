/** Kept in step with docs/WAKE-ON-LAN.md. */
export const WAKE_SETUP_STEPS = [
  'Turn on Wake-on-LAN in the PC’s BIOS/UEFI.',
  'In Device Manager, open the network adapter’s properties and enable “Wake on Magic Packet” (Power Management: “Allow this device to wake the computer”).',
  'Turn off Windows Fast Startup (Control Panel › Power Options › Choose what the power buttons do).',
  'Keep the PC wired, on the same network as the home server.',
  'Let the home server see the PC: allow port 445 (or Remote Desktop) from the server, so the app can tell On from Off and keep its history.',
  'Find the MAC address with “getmac /v” or “ipconfig /all” (Physical Address of the Ethernet adapter).',
]
