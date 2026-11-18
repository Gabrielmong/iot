package service

import (
	"context"
	"time"

	"homeagent/internal/client"
	"homeagent/internal/paths"
	"homeagent/internal/protocol"
	"homeagent/internal/state"
)

// ensureEnrolled redeems the install's one-time code if there is one (see enroll).
func ensureEnrolled(ctx context.Context, st state.State, info func() protocol.Hello, log client.Logger) (state.State, error) {
	redeem := func(ctx context.Context, code string) (string, string, error) {
		return client.Enroll(ctx, st.Server, code, info())
	}
	save := func(s state.State) error { return state.Save(paths.StateFile(), s) }
	return enroll(ctx, st, redeem, save, sleepCtx, log)
}

func sleepCtx(ctx context.Context, d time.Duration) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-time.After(d):
		return nil
	}
}
