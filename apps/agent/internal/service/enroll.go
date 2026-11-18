package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"homeagent/internal/client"
	"homeagent/internal/state"
)

// errGone: the pairing code can't be used any more; the service stops and waits for a fresh download.
var errGone = errors.New("This download has already been used or expired. Download it again from the app.")

type redeemFunc func(ctx context.Context, code string) (deviceID, token string, err error)

// enroll trades a pending one-time code for a device id and token, retrying network errors. Without a
// code the saved pairing is used as is. A code that was already used or expired falls back to the saved
// pairing when there is one (the same download run twice), so a re-run never breaks a working agent.
func enroll(ctx context.Context, st state.State, redeem redeemFunc, save func(state.State) error,
	sleep func(context.Context, time.Duration) error, log client.Logger) (state.State, error) {
	if st.Code == "" {
		if st.Token == "" {
			return st, errGone
		}
		return st, nil
	}
	var b client.Backoff
	for {
		id, token, err := redeem(ctx, st.Code)
		if errors.Is(err, client.ErrCodeGone) {
			if st.Token == "" {
				return st, errGone
			}
			kept := state.State{Server: st.Server, DeviceID: st.DeviceID, Token: st.Token}
			if err := save(kept); err != nil {
				return st, err
			}
			log.Error("This download had already been used or expired; keeping the existing pairing.")
			return kept, nil
		}
		if err == nil {
			enrolled := state.State{Server: st.Server, DeviceID: id, Token: token}
			if err := save(enrolled); err != nil {
				return st, err
			}
			log.Info("paired with " + st.Server)
			return enrolled, nil
		}
		wait := b.Next()
		log.Error(fmt.Sprintf("couldn't pair with %s (%v); trying again in %v", st.Server, err, wait))
		if err := sleep(ctx, wait); err != nil {
			return st, err
		}
	}
}
