package service

import (
	"strconv"
	"strings"
)

// firstWin11Build: Windows 11 kept "Windows 10" in the registry's ProductName; the build number tells them apart.
const firstWin11Build = 22000

// osName is the PC's Windows edition as people know it, from the registry's ProductName and CurrentBuildNumber.
func osName(product, build string) string {
	if product == "" {
		return "Windows"
	}
	if n, err := strconv.Atoi(build); err == nil && n >= firstWin11Build && strings.HasPrefix(product, "Windows 10") {
		return "Windows 11" + strings.TrimPrefix(product, "Windows 10")
	}
	return product
}
