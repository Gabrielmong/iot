package stats

import "testing"

func TestParsesNvidiaSmi(t *testing.T) {
	g, err := parseNvidiaSmi("NVIDIA GeForce RTX 3070, 37, 54\n")
	if err != nil {
		t.Fatal(err)
	}
	if g.Name != "NVIDIA GeForce RTX 3070" || g.Load != 37 || g.TempC != 54 {
		t.Fatalf("got %+v", g)
	}
}

func TestTakesTheFirstGpu(t *testing.T) {
	g, err := parseNvidiaSmi("NVIDIA GeForce RTX 4090, 5, 40\r\nNVIDIA GeForce GTX 1060, 0, 30\r\n")
	if err != nil || g.Name != "NVIDIA GeForce RTX 4090" {
		t.Fatalf("got %+v %v", g, err)
	}
}

func TestRejectsBadNvidiaSmiOutput(t *testing.T) {
	for _, out := range []string{"", "No devices were found\n", "RTX, [N/A], 54\n", "RTX, 37\n"} {
		if _, err := parseNvidiaSmi(out); err == nil {
			t.Errorf("%q accepted", out)
		}
	}
}

func TestNvidiaSmiOnlyFromTrustedFolders(t *testing.T) {
	has := map[string]bool{`C:\Program Files\NVIDIA Corporation\NVSMI\nvidia-smi.exe`: true, `C:\Users\Public\nvidia-smi.exe`: true}
	exists := func(p string) bool { return has[p] }
	if got := nvidiaSmiPath(`C:\Windows\System32`, `C:\Program Files`, exists); got != `C:\Program Files\NVIDIA Corporation\NVSMI\nvidia-smi.exe` {
		t.Fatalf("got %q", got)
	}
	has[`C:\Windows\System32\nvidia-smi.exe`] = true
	if got := nvidiaSmiPath(`C:\Windows\System32`, `C:\Program Files`, exists); got != `C:\Windows\System32\nvidia-smi.exe` {
		t.Fatalf("got %q", got)
	}
	if got := nvidiaSmiPath(`C:\Windows\System32`, `C:\Program Files`, func(string) bool { return false }); got != "" {
		t.Fatalf("got %q", got)
	}
}
