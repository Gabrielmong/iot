// Package rdplink handles `home-rdp://<ip>` links: the web app's Remote Desktop button opens one, Windows
// hands it to `HomeAgent.exe rdp <link>`, and the agent starts Remote Desktop Connection to that PC.
package rdplink

import (
	"errors"
	"net/netip"
	"net/url"
	"strings"
)

// Scheme is the link type the agent registers on the PC.
const Scheme = "home-rdp"

var errBadLink = errors.New("not a Remote Desktop link to a PC on the home network")

// Host is the PC address in a `home-rdp://` link. Any website can open such a link, so only a bare private
// IPv4 address is accepted: no names, ports, paths, queries or user info.
func Host(raw string) (string, error) {
	u, err := url.Parse(raw)
	if err != nil || !strings.EqualFold(u.Scheme, Scheme) || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Port() != "" {
		return "", errBadLink
	}
	if u.Path != "" && u.Path != "/" {
		return "", errBadLink
	}
	ip, err := netip.ParseAddr(u.Hostname())
	if err != nil || !ip.Is4() || !ip.IsPrivate() {
		return "", errBadLink
	}
	return ip.String(), nil
}
