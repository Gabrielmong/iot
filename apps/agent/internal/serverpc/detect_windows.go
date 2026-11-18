package serverpc

import (
	"os"

	"golang.org/x/sys/windows/registry"
	"golang.org/x/sys/windows/svc"
	"golang.org/x/sys/windows/svc/mgr"
)

const deployerService = "HomeDeployer"

// Detect reports whether this PC runs the Home server (the HomeDeployer service exists) and the deployer's
// config: from deployer.json named in the service's NSSM AppParameters, else the default install root.
func Detect() (Config, bool) {
	m, err := mgr.Connect()
	if err != nil {
		return Config{}, false
	}
	defer m.Disconnect()
	s, err := m.OpenService(deployerService)
	if err != nil {
		return Config{}, false
	}
	s.Close()
	return readConfig(), true
}

func readConfig() Config {
	k, err := registry.OpenKey(registry.LOCAL_MACHINE, `SYSTEM\CurrentControlSet\Services\`+deployerService+`\Parameters`, registry.QUERY_VALUE)
	if err != nil {
		return Fallback()
	}
	defer k.Close()
	params, _, err := k.GetStringValue("AppParameters")
	if err != nil {
		return Fallback()
	}
	path, ok := ConfigPathFromParams(params)
	if !ok {
		return Fallback()
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return Fallback()
	}
	c, err := ParseConfig(raw)
	if err != nil {
		return Fallback()
	}
	return c
}

// ServiceRunning reports whether the named Windows service is Running.
func ServiceRunning(name string) bool {
	m, err := mgr.Connect()
	if err != nil {
		return false
	}
	defer m.Disconnect()
	s, err := m.OpenService(name)
	if err != nil {
		return false
	}
	defer s.Close()
	st, err := s.Query()
	return err == nil && st.State == svc.Running
}
