package rdplink

import (
	"errors"
	"fmt"
	"os/exec"

	"golang.org/x/sys/windows/registry"

	"homeagent/internal/paths"
)

const classKey = `SOFTWARE\Classes\` + Scheme

// Register makes Windows open `home-rdp://` links with `exe rdp <link>`, for every user of the PC.
// It runs on every service start, so agents installed before this link existed get it on their next update.
func Register(exe string) error {
	if err := setDefault(classKey, "URL:Home Remote Desktop", map[string]string{"URL Protocol": ""}); err != nil {
		return err
	}
	return setDefault(classKey+`\shell\open\command`, fmt.Sprintf(`"%s" rdp "%%1"`, exe), nil)
}

// Unregister removes the link type (leaf keys first: Windows deletes only empty keys).
func Unregister() error {
	for _, k := range []string{`\shell\open\command`, `\shell\open`, `\shell`, ""} {
		if err := registry.DeleteKey(registry.LOCAL_MACHINE, classKey+k); err != nil && !errors.Is(err, registry.ErrNotExist) {
			return err
		}
	}
	return nil
}

// Open starts Remote Desktop Connection to the PC a `home-rdp://` link names.
func Open(link string) error {
	host, err := Host(link)
	if err != nil {
		return err
	}
	return exec.Command(paths.System32("mstsc.exe"), "/v:"+host).Start()
}

func setDefault(path, value string, extra map[string]string) error {
	k, _, err := registry.CreateKey(registry.LOCAL_MACHINE, path, registry.SET_VALUE)
	if err != nil {
		return err
	}
	defer k.Close()
	if err := k.SetStringValue("", value); err != nil {
		return err
	}
	for name, v := range extra {
		if err := k.SetStringValue(name, v); err != nil {
			return err
		}
	}
	return nil
}
