package power

import "testing"

func TestDecide(t *testing.T) {
	cases := []struct {
		s    Session
		want Mode
	}{
		{Session{SignedIn: false}, Now},
		{Session{SignedIn: true, Locked: true}, Now},
		{Session{SignedIn: true}, Prompt},
	}
	for _, c := range cases {
		if got := Decide(c.s); got != c.want {
			t.Errorf("%+v: got %v", c.s, got)
		}
	}
}
