package netinfo

import (
	"reflect"
	"testing"
)

var (
	wired   = Adapter{Name: "Ethernet", MAC: "aa:aa:aa:aa:aa:01", Wired: true, Up: true, IPs: []string{"192.168.0.20"}}
	wifi    = Adapter{Name: "Wi-Fi", MAC: "aa:aa:aa:aa:aa:02", Up: true, IPs: []string{"192.168.0.21"}}
	hyperV  = Adapter{Name: "vEthernet (Default Switch)", MAC: "aa:aa:aa:aa:aa:03", Wired: true, Up: true, Virtual: true, IPs: []string{"172.20.0.1"}}
	wiredDn = Adapter{Name: "Ethernet 2", MAC: "aa:aa:aa:aa:aa:04", Wired: true}
)

func TestPrefersTheUpWiredAdapter(t *testing.T) {
	wake, macs, ips := Choose([]Adapter{wifi, hyperV, wired})
	if wake != wired.MAC {
		t.Fatalf("wake %s", wake)
	}
	if !reflect.DeepEqual(macs, []string{wired.MAC, wifi.MAC}) {
		t.Fatalf("macs %v", macs)
	}
	if !reflect.DeepEqual(ips, []string{"192.168.0.20", "192.168.0.21"}) {
		t.Fatalf("ips %v", ips)
	}
}

func TestFallsBackToADownWiredAdapter(t *testing.T) {
	wake, _, _ := Choose([]Adapter{wifi, wiredDn})
	if wake != wiredDn.MAC {
		t.Fatalf("wake %s", wake)
	}
}

func TestFallsBackToWiFi(t *testing.T) {
	wake, macs, _ := Choose([]Adapter{hyperV, wifi})
	if wake != wifi.MAC || !reflect.DeepEqual(macs, []string{wifi.MAC}) {
		t.Fatalf("wake %s macs %v", wake, macs)
	}
}

func TestNothingRealMeansNoWakeMac(t *testing.T) {
	wake, macs, ips := Choose([]Adapter{hyperV})
	if wake != "" || len(macs) != 0 || len(ips) != 0 {
		t.Fatalf("got %s %v %v", wake, macs, ips)
	}
}

func TestVirtualNames(t *testing.T) {
	for _, name := range []string{"Hyper-V Virtual Ethernet Adapter", "vEthernet (WSL)", "WSL (Hyper-V firewall)", "Software Loopback Interface 1", "TAP-Windows Adapter V9", "WireGuard Tunnel", "VirtualBox Host-Only Ethernet Adapter", "VMware Virtual Ethernet Adapter for VMnet8", "Cisco AnyConnect VPN Virtual Miniport", "Bluetooth Device (Personal Area Network)"} {
		if !IsVirtualName(name) {
			t.Errorf("%q should be virtual", name)
		}
	}
	for _, name := range []string{"Intel(R) Ethernet Controller I225-V", "Realtek PCIe GbE Family Controller", "Intel(R) Wi-Fi 6 AX201 160MHz"} {
		if IsVirtualName(name) {
			t.Errorf("%q should be real", name)
		}
	}
}
