package stats

import (
	"time"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/mem"
	"github.com/shirou/gopsutil/v4/net"
)

// DefaultSources read this PC.
func DefaultSources() Sources {
	return Sources{
		CPU:     cpuPercent,
		Memory:  memory,
		Disks:   fixedDisks,
		Net:     netBytes,
		Uptime:  uptime,
		GPU:     nvidiaGPU,
		Session: activeSession,
		Now:     time.Now,
	}
}

func cpuPercent() float64 {
	p, err := cpu.Percent(0, false) // since the previous call
	if err != nil || len(p) == 0 {
		return 0
	}
	return p[0]
}

func memory() (float64, float64) {
	v, err := mem.VirtualMemory()
	if err != nil {
		return 0, 0
	}
	return float64(v.Used), float64(v.Total)
}

func netBytes() (uint64, uint64) {
	c, err := net.IOCounters(false)
	if err != nil || len(c) == 0 {
		return 0, 0
	}
	return c[0].BytesSent, c[0].BytesRecv
}

func uptime() int64 {
	u, err := host.Uptime()
	if err != nil {
		return 0
	}
	return int64(u)
}
