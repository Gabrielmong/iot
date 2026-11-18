package service

import (
	"os"

	"golang.org/x/sys/windows/registry"

	"homeagent/internal/netinfo"
	"homeagent/internal/protocol"
)

// hello describes this PC; it is rebuilt on every connection so addresses stay current.
func hello(version int) func() protocol.Hello {
	return func() protocol.Hello {
		h := protocol.Hello{Version: version, OS: windowsName(), IPs: []string{}, MACs: []string{}}
		h.Hostname, _ = os.Hostname()
		if adapters, err := netinfo.List(); err == nil {
			h.WakeMAC, h.MACs, h.IPs = netinfo.Choose(adapters)
		}
		return h
	}
}

func windowsName() string {
	k, err := registry.OpenKey(registry.LOCAL_MACHINE, `SOFTWARE\Microsoft\Windows NT\CurrentVersion`, registry.QUERY_VALUE)
	if err != nil {
		return osName("", "")
	}
	defer k.Close()
	product, _, _ := k.GetStringValue("ProductName")
	build, _, _ := k.GetStringValue("CurrentBuildNumber")
	return osName(product, build)
}
