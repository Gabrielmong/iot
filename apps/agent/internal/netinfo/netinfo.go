// Package netinfo picks which network adapters identify this PC: the MAC to wake it by, every real MAC, its IPs.
package netinfo

import "strings"

// Adapter is one network interface as Windows reports it. Virtual: Hyper-V, WSL, VPN, loopback and the like.
type Adapter struct {
	Name    string
	MAC     string // lower-case, colon-separated
	Wired   bool
	Up      bool
	Virtual bool
	IPs     []string // IPv4 only
}

var virtualMarkers = []string{"hyper-v", "vethernet", "wsl", "loopback", "tap-", "tun", "wireguard", "virtualbox", "vmware", "vpn", "virtual", "bluetooth", "npcap", "zerotier", "tailscale"}

// IsVirtualName reports whether an adapter's name or description marks it as virtual (never a wake target).
func IsVirtualName(name string) bool {
	n := strings.ToLower(name)
	for _, m := range virtualMarkers {
		if strings.Contains(n, m) {
			return true
		}
	}
	return false
}

// Choose returns the wake MAC (the up wired adapter, else the first wired, else Wi-Fi), every real MAC with the
// wake MAC first, and the real adapters' IPs (the wake adapter's first; only adapters that are up).
func Choose(adapters []Adapter) (wakeMAC string, macs []string, ips []string) {
	var real []Adapter
	for _, a := range adapters {
		if !a.Virtual && a.MAC != "" {
			real = append(real, a)
		}
	}
	wake := pick(real)
	if wake < 0 {
		return "", nil, nil
	}
	ordered := append([]Adapter{real[wake]}, append(append([]Adapter{}, real[:wake]...), real[wake+1:]...)...)
	seenIP := map[string]bool{}
	for _, a := range ordered {
		macs = append(macs, a.MAC)
		if !a.Up {
			continue
		}
		for _, ip := range a.IPs {
			if !seenIP[ip] {
				seenIP[ip] = true
				ips = append(ips, ip)
			}
		}
	}
	return real[wake].MAC, macs, ips
}

func pick(real []Adapter) int {
	for i, a := range real {
		if a.Wired && a.Up {
			return i
		}
	}
	for i, a := range real {
		if a.Wired {
			return i
		}
	}
	if len(real) > 0 {
		return 0
	}
	return -1
}
