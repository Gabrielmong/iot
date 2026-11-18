package rdplink

import "testing"

func TestHostTakesAPrivateIPv4(t *testing.T) {
	for raw, want := range map[string]string{
		"home-rdp://192.168.0.100":  "192.168.0.100",
		"home-rdp://192.168.0.100/": "192.168.0.100",
		"HOME-RDP://10.1.2.3":       "10.1.2.3",
		"home-rdp://172.16.0.9/":    "172.16.0.9",
	} {
		got, err := Host(raw)
		if err != nil || got != want {
			t.Errorf("%q: got %q, %v", raw, got, err)
		}
	}
}

func TestHostRefusesAnythingElse(t *testing.T) {
	for _, raw := range []string{
		"",
		"home-rdp://",
		"rdp://192.168.0.100",
		"home-rdp://8.8.8.8",               // not on the home network
		"home-rdp://pc.example.com",        // names could point anywhere
		"home-rdp://192.168.0.100:3389",    // no ports
		"home-rdp://192.168.0.100/x",       // no paths
		"home-rdp://192.168.0.100?a=b",     // no queries
		"home-rdp://user@192.168.0.100",    // no user info
		"home-rdp://192.168.0.100 /admin",  // no extra arguments
		"home-rdp://[fd00::1]",             // IPv4 only
	} {
		if h, err := Host(raw); err == nil {
			t.Errorf("%q accepted as %q", raw, h)
		}
	}
}
