package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"sync/atomic"
	"time"

	figlet "github.com/common-nighthawk/go-figure"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	// Allow all origins in development — tighten this in production
	CheckOrigin: func(r *http.Request) bool { return true },
}

// Monotonic counter for unique client IDs
var clientIDCounter atomic.Uint64

func main() {
	addr := flag.String("addr", ":8080", "address to listen on")
	dev := flag.Bool("dev", false, "disable caching for local dev")
	flag.Parse()

	const dir = "../public"
	if _, err := os.Stat(dir); err != nil {
		log.Fatalf("static dir: %v", err)
	}

	hub := newHub()

	mux := http.NewServeMux()

	// ── WebSocket endpoint ──────────────────────────────────────
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("ws upgrade: %v", err)
			return
		}
		id := fmt.Sprintf("c%d", clientIDCounter.Add(1))
		c := newClient(hub, conn, id)
		go c.writePump()
		go c.readPump()
		// Note: register happens after "join" message is received (in handleMessage)
	})

	// ── Static files ────────────────────────────────────────────
	fs := http.FileServer(http.Dir(dir))
	mux.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		if *dev {
			w.Header().Set("Cache-Control", "no-store")
		}
		fs.ServeHTTP(w, r)
	}))

	// ── Start server ────────────────────────────────────────────
	ln, err := net.Listen("tcp4", *addr)
	if err != nil {
		log.Fatalf("listen: %v", err)
	}

	srv := &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	figlet.NewFigure("BOMBERMAN", "small", false).Print()
	fmt.Printf("\nServing %s  →  http://%s\n\n", absPath(dir), ln.Addr())

	// ── Graceful shutdown ───────────────────────────────────────
	idle := make(chan struct{})
	go func() {
		c := make(chan os.Signal, 1)
		signal.Notify(c, os.Interrupt)
		<-c
		fmt.Println("\nshutting down…")
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(ctx)
		close(idle)
	}()

	if err := srv.Serve(ln); err != nil && err != http.ErrServerClosed {
		log.Fatalf("serve: %v", err)
	}
	<-idle
}

func absPath(p string) string {
	ap, err := filepath.Abs(p)
	if err != nil {
		return p
	}
	return ap
}
