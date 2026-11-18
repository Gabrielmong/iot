package client

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"

	"homeagent/internal/protocol"
)

const (
	heartbeatEvery = 30 * time.Second
	rejectedWait   = time.Hour
	stableAfter    = 30 * time.Second
	writeTimeout   = 10 * time.Second
)

var errRejected = errors.New("server rejected the agent token")

// Config is where to connect and how. HeartbeatEvery and Sleep are for tests; zero means the defaults.
type Config struct {
	Server         string
	Token          string
	Log            Logger
	HeartbeatEvery time.Duration
	Sleep          func(ctx context.Context, d time.Duration) error
}

// Client keeps one WebSocket to the server open, reconnecting with backoff, and relays messages to a Handler.
type Client struct {
	cfg   Config
	h     Handler
	hello func() protocol.Hello

	mu   sync.Mutex
	conn *websocket.Conn
}

// New prepares a client; hello is called on every connection (so IPs and MACs are current).
func New(cfg Config, h Handler, hello func() protocol.Hello) *Client {
	if cfg.HeartbeatEvery == 0 {
		cfg.HeartbeatEvery = heartbeatEvery
	}
	if cfg.Sleep == nil {
		cfg.Sleep = sleep
	}
	return &Client{cfg: cfg, h: h, hello: hello}
}

// Run connects until ctx ends. A rejected token waits an hour between tries; it never uninstalls on its own.
func (c *Client) Run(ctx context.Context) error {
	var b Backoff
	for ctx.Err() == nil {
		started := time.Now()
		err := c.session(ctx)
		if ctx.Err() != nil {
			break
		}
		wait := b.Next()
		if errors.Is(err, errRejected) {
			c.cfg.Log.Error("server rejected the agent token; trying again in an hour")
			wait = rejectedWait
		} else {
			if time.Since(started) >= stableAfter {
				b.Reset()
				wait = b.Next()
			}
			c.cfg.Log.Info(fmt.Sprintf("disconnected (%v); reconnecting in %v", err, wait))
		}
		if c.cfg.Sleep(ctx, wait) != nil {
			break
		}
	}
	return ctx.Err()
}

// Send writes one message; false when not connected or the write failed.
func (c *Client) Send(msg protocol.Outgoing) bool {
	c.mu.Lock()
	conn := c.conn
	c.mu.Unlock()
	if conn == nil {
		return false
	}
	ctx, cancel := context.WithTimeout(context.Background(), writeTimeout)
	defer cancel()
	return conn.Write(ctx, websocket.MessageText, protocol.Encode(msg)) == nil
}

func (c *Client) session(ctx context.Context) error {
	conn, res, err := websocket.Dial(ctx, wsURL(c.cfg.Server), &websocket.DialOptions{
		HTTPHeader: http.Header{"Authorization": {"Bearer " + c.cfg.Token}},
	})
	if res != nil && res.StatusCode == http.StatusUnauthorized {
		return errRejected
	}
	if err != nil {
		return err
	}
	defer conn.CloseNow()
	c.setConn(conn)
	defer func() {
		c.setConn(nil)
		c.h.OnDisconnected()
	}()
	c.cfg.Log.Info("connected to " + c.cfg.Server)
	if !c.Send(c.hello()) {
		return errors.New("hello failed")
	}
	c.h.OnConnected()
	sctx, cancel := context.WithCancel(ctx)
	defer cancel()
	go c.heartbeats(sctx)
	return c.read(sctx, conn)
}

func (c *Client) read(ctx context.Context, conn *websocket.Conn) error {
	for {
		_, data, err := conn.Read(ctx)
		if err != nil {
			return err
		}
		m, err := protocol.Decode(data)
		if err != nil {
			c.cfg.Log.Error("ignored a message: " + err.Error())
			continue
		}
		dispatch(c.h, m)
	}
}

func (c *Client) heartbeats(ctx context.Context) {
	t := time.NewTicker(c.cfg.HeartbeatEvery)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			c.Send(protocol.Heartbeat{})
		}
	}
}

func (c *Client) setConn(conn *websocket.Conn) {
	c.mu.Lock()
	c.conn = conn
	c.mu.Unlock()
}

func wsURL(server string) string {
	s := strings.TrimRight(server, "/")
	switch {
	case strings.HasPrefix(s, "https://"):
		s = "wss://" + strings.TrimPrefix(s, "https://")
	case strings.HasPrefix(s, "http://"):
		s = "ws://" + strings.TrimPrefix(s, "http://")
	}
	return s + "/agent/ws"
}

func sleep(ctx context.Context, d time.Duration) error {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}
