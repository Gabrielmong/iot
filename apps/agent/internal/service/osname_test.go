package service

import "testing"

func TestOSName(t *testing.T) {
	cases := []struct{ product, build, want string }{
		{"Windows 10 Pro", "26200", "Windows 11 Pro"}, // Windows 11 still says 10 in ProductName
		{"Windows 10 Pro", "19045", "Windows 10 Pro"},
		{"Windows 10 Home", "22000", "Windows 11 Home"},
		{"Windows Server 2022 Standard", "20348", "Windows Server 2022 Standard"},
		{"", "", "Windows"},
	}
	for _, c := range cases {
		if got := osName(c.product, c.build); got != c.want {
			t.Errorf("osName(%q, %q) = %q, want %q", c.product, c.build, got, c.want)
		}
	}
}
