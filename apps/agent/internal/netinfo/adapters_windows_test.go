package netinfo

import "testing"

func TestListsThisPCsAdapters(t *testing.T) {
	adapters, err := List()
	if err != nil {
		t.Fatal(err)
	}
	if len(adapters) == 0 {
		t.Fatal("no adapters")
	}
	wake, macs, ips := Choose(adapters)
	t.Logf("wake %s macs %v ips %v", wake, macs, ips)
}
