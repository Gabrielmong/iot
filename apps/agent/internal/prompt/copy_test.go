package prompt

import "testing"

func TestCopy(t *testing.T) {
	cases := map[string]string{
		"restart":  "Ann is restarting this PC in 60 s",
		"sleep":    "Ann is putting this PC to sleep in 60 s",
		"shutdown": "Ann is shutting down this PC in 60 s",
	}
	for action, want := range cases {
		if got := Text(action, "Ann", 60); got != want {
			t.Errorf("%s: %q", action, got)
		}
	}
}
