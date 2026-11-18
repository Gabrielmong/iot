//go:build !windows

package main

import (
	"fmt"
	"os"
)

var version = "0"

func main() {
	fmt.Fprintln(os.Stderr, "HomeAgent runs on Windows only")
	os.Exit(1)
}
