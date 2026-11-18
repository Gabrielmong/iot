package install

import (
	"errors"
	"time"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/svc"
	"golang.org/x/sys/windows/svc/mgr"

	"homeagent/internal/paths"
)

// register creates (or updates) the HomeAgent service: auto start, LocalSystem, restart on failure.
func register(m *mgr.Mgr, exe string) (*mgr.Service, error) {
	cfg := mgr.Config{
		StartType:   mgr.StartAutomatic,
		DisplayName: "HomeAgent",
		Description: "Lets the home app sleep, shut down and restart this PC and show its live stats.",
	}
	s, err := m.OpenService(paths.ServiceName)
	if err == nil {
		cfg.BinaryPathName = windows.EscapeArg(exe) + " service"
		if err := s.UpdateConfig(cfg); err != nil {
			s.Close()
			return nil, err
		}
	} else if s, err = m.CreateService(paths.ServiceName, exe, cfg, "service"); err != nil {
		return nil, err
	}
	restart := mgr.RecoveryAction{Type: mgr.ServiceRestart, Delay: 5 * time.Second}
	_ = s.SetRecoveryActions([]mgr.RecoveryAction{restart, restart, restart}, 24*60*60)
	return s, nil
}

// stopAndWait stops the service if it runs and waits (up to 30 s) until it has.
func stopAndWait(s *mgr.Service) error {
	st, err := s.Query()
	if err != nil {
		return err
	}
	if st.State == svc.Stopped {
		return nil
	}
	if _, err := s.Control(svc.Stop); err != nil && !errors.Is(err, windows.ERROR_SERVICE_NOT_ACTIVE) {
		return err
	}
	deadline := time.Now().Add(30 * time.Second)
	for time.Now().Before(deadline) {
		if st, err = s.Query(); err != nil || st.State == svc.Stopped {
			return err
		}
		time.Sleep(300 * time.Millisecond)
	}
	return errors.New("the HomeAgent service didn't stop")
}

// StopService stops HomeAgent (update helper).
func StopService() error {
	return withService(stopAndWait)
}

// StartService starts HomeAgent (update helper).
func StartService() error {
	return withService(func(s *mgr.Service) error { return s.Start() })
}

func withService(f func(*mgr.Service) error) error {
	m, err := mgr.Connect()
	if err != nil {
		return err
	}
	defer m.Disconnect()
	s, err := m.OpenService(paths.ServiceName)
	if err != nil {
		return err
	}
	defer s.Close()
	return f(s)
}
