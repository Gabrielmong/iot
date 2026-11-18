package netinfo

import (
	"fmt"
	"net"
	"strings"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	ifTypeEthernet = 6
	ifTypeWiFi     = 71
	ifOperUp       = 1
)

// List returns this PC's Ethernet and Wi-Fi adapters (anything else is marked Virtual).
func List() ([]Adapter, error) {
	size := uint32(16 << 10)
	for range 3 {
		buf := make([]byte, size)
		first := (*windows.IpAdapterAddresses)(unsafe.Pointer(&buf[0]))
		err := windows.GetAdaptersAddresses(windows.AF_UNSPEC, windows.GAA_FLAG_SKIP_ANYCAST|windows.GAA_FLAG_SKIP_MULTICAST|windows.GAA_FLAG_SKIP_DNS_SERVER, 0, first, &size)
		if err == windows.ERROR_BUFFER_OVERFLOW {
			continue
		}
		if err != nil {
			return nil, err
		}
		var out []Adapter
		for a := first; a != nil; a = a.Next {
			out = append(out, convert(a))
		}
		return out, nil
	}
	return nil, fmt.Errorf("adapter list kept growing")
}

func convert(a *windows.IpAdapterAddresses) Adapter {
	name := windows.UTF16PtrToString(a.FriendlyName)
	desc := windows.UTF16PtrToString(a.Description)
	known := a.IfType == ifTypeEthernet || a.IfType == ifTypeWiFi
	return Adapter{
		Name:    name,
		MAC:     mac(a.PhysicalAddress[:a.PhysicalAddressLength]),
		Wired:   a.IfType == ifTypeEthernet,
		Up:      a.OperStatus == ifOperUp,
		Virtual: !known || IsVirtualName(name) || IsVirtualName(desc),
		IPs:     ipv4s(a),
	}
}

func mac(b []byte) string {
	if len(b) != 6 {
		return ""
	}
	return strings.ToLower(net.HardwareAddr(b).String())
}

func ipv4s(a *windows.IpAdapterAddresses) []string {
	var out []string
	for u := a.FirstUnicastAddress; u != nil; u = u.Next {
		ip := u.Address.IP()
		if v4 := ip.To4(); v4 != nil && !v4.IsLinkLocalUnicast() {
			out = append(out, v4.String())
		}
	}
	return out
}
