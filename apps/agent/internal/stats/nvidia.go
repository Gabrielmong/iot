package stats

import (
	"context"
	"errors"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"homeagent/internal/protocol"
)

var nvidiaArgs = []string{"--query-gpu=name,utilization.gpu,temperature.gpu", "--format=csv,noheader,nounits"}

// nvidiaGPU asks nvidia-smi (when installed) for the first GPU's load and temperature; nil otherwise.
func nvidiaGPU(ctx context.Context) *protocol.Gpu {
	path := trustedNvidiaSmi()
	if path == "" {
		return nil
	}
	ctx, cancel := context.WithTimeout(ctx, 1500*time.Millisecond)
	defer cancel()
	cmd := exec.CommandContext(ctx, path, nvidiaArgs...)
	hideWindow(cmd)
	out, err := cmd.Output()
	if err != nil {
		return nil
	}
	g, err := parseNvidiaSmi(string(out))
	if err != nil {
		return nil
	}
	return g
}

// nvidiaSmiPath picks nvidia-smi from the folders the NVIDIA driver installs it to, never from PATH (the agent
// runs as SYSTEM; PATH may hold folders any user can write to). "" when it isn't there.
func nvidiaSmiPath(systemDir, programFiles string, exists func(string) bool) string {
	for _, p := range []string{systemDir + `\nvidia-smi.exe`, programFiles + `\NVIDIA Corporation\NVSMI\nvidia-smi.exe`} {
		if exists(p) {
			return p
		}
	}
	return ""
}

// parseNvidiaSmi reads "name, load, temp" from the first line.
func parseNvidiaSmi(out string) (*protocol.Gpu, error) {
	line, _, _ := strings.Cut(strings.TrimSpace(out), "\n")
	parts := strings.Split(strings.TrimSpace(line), ",")
	if len(parts) != 3 {
		return nil, errors.New("unexpected nvidia-smi output")
	}
	load, err1 := strconv.ParseFloat(strings.TrimSpace(parts[1]), 64)
	temp, err2 := strconv.ParseFloat(strings.TrimSpace(parts[2]), 64)
	name := strings.TrimSpace(parts[0])
	if err1 != nil || err2 != nil || name == "" {
		return nil, errors.New("unexpected nvidia-smi output")
	}
	return &protocol.Gpu{Name: name, Load: load, TempC: temp}, nil
}
