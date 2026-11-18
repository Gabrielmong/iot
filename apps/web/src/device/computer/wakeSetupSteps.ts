/** Kept in step with docs/WAKE-ON-LAN.md. */
export const WAKE_SETUP_STEPS = [
  'In Device Manager › Network adapters, open the Ethernet adapter’s Properties. On the Power Management tab, tick “Allow this device to wake the computer”.',
  'On the adapter’s Advanced tab, confirm “Enable PME” is Enabled, and set “Wake on Magic Packet” to Enabled.',
  'In the BIOS/UEFI, turn on the motherboard’s wake-from-network setting (e.g. ASUS “Power On By PCI-E”, MSI “Resume By PCI-E Device”, Gigabyte “Wake on LAN”, ASRock “PCIE Devices Power On”). Turn off “ErP”/“Deep Sleep” if present.',
  'Turn off Windows Fast Startup (Control Panel › Power Options › Choose what the power buttons do).',
  'Keep the PC wired, on the same network as the home server.',
  'Let the home server see the PC: allow port 445 (or Remote Desktop) from the server, so the app can tell On from Off and keep its history.',
  'Find the MAC address with “getmac /v” or “ipconfig /all” (Physical Address of the Ethernet adapter).',
]
