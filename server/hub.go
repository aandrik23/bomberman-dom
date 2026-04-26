package main

import (
	"context"
	"encoding/json"
	"log"
	"math/rand"
	"strings"
	"sync"
	"time"
)

// ── Message shapes ────────────────────────────────────────────────────────────

type msgType struct {
	Type string `json:"type"`
}

type joinMsg struct {
	Nickname string `json:"nickname"`
}

type inputMsg struct {
	Dir      struct {
		Dx int `json:"dx"`
		Dy int `json:"dy"`
	} `json:"dir"`
	DropBomb bool `json:"dropBomb"`
}

type chatMsg struct {
	Nickname string `json:"nickname"`
	Message  string `json:"message"`
}

type gameOverMsg struct {
	Winner int `json:"winner"`
}

// ── Outbound payloads ─────────────────────────────────────────────────────────

type lobbyPlayer struct {
	Nickname    string `json:"nickname"`
	PlayerIndex int    `json:"playerIndex"`
}

type lobbyPayload struct {
	Type      string        `json:"type"`
	Players   []lobbyPlayer `json:"players"`
	Countdown *int          `json:"countdown"` // null when no timer is running
}

type startPayload struct {
	Type            string        `json:"type"`
	YourPlayerIndex int           `json:"yourPlayerIndex"`
	Players         []lobbyPlayer `json:"players"`
	Map             []string      `json:"map"`
}

type relayInputPayload struct {
	Type        string `json:"type"`
	PlayerIndex int    `json:"playerIndex"`
	Dir         struct {
		Dx int `json:"dx"`
		Dy int `json:"dy"`
	} `json:"dir"`
	DropBomb bool `json:"dropBomb"`
}

type relayChatPayload struct {
	Type     string `json:"type"`
	Nickname string `json:"nickname"`
	Message  string `json:"message"`
}

type gameOverPayload struct {
	Type   string `json:"type"`
	Winner int    `json:"winner"`
}

// ── Map generation ───────────────────────────────────────────────────────────

var baseMap = []string{
	"XXXXXXXXXXXXXXXXX",
	"X1  B   B   B  2X",
	"X X B X B X B X X",
	"X   B   B   B   X",
	"X X X X X X X X X",
	"X B   B   B   B X",
	"X X B X   X B X X",
	"X B   B   B   B X",
	"X X X X X X X X X",
	"X   B   B   B   X",
	"X X B X B X B X X",
	"X3  B   B   B  4X",
	"XXXXXXXXXXXXXXXXX",
}

var spawnPositions = [][2]int{{1, 1}, {15, 1}, {1, 11}, {15, 11}}

func generateMap() []string {
	rows := len(baseMap)
	cols := len(baseMap[0])

	// Build 2D rune grid
	grid := make([][]rune, rows)
	for y, row := range baseMap {
		grid[y] = []rune(row)
	}

	// Safe zones: 3×3 around each spawn
	safe := make(map[[2]int]bool)
	for _, sp := range spawnPositions {
		for dy := -1; dy <= 1; dy++ {
			for dx := -1; dx <= 1; dx++ {
				safe[[2]int{sp[0] + dx, sp[1] + dy}] = true
			}
		}
	}

	// Randomly place bricks and replace spawn markers
	powerTypes := []rune{'b', 'f', 's'}
	for y := 0; y < rows; y++ {
		for x := 0; x < cols; x++ {
			c := grid[y][x]
			if c == '1' || c == '2' || c == '3' || c == '4' {
				grid[y][x] = ' '
				continue
			}
			// Pre-existing B tiles: maybe assign a power-up
			if c == 'B' && !safe[[2]int{x, y}] {
				if rand.Float64() < 0.33 {
					grid[y][x] = powerTypes[rand.Intn(3)]
				}
				continue
			}
			// Empty floor tiles: randomly place a brick (possibly with power-up)
			if c == ' ' && !safe[[2]int{x, y}] {
				if rand.Float64() < 0.5 {
					if rand.Float64() < 0.33 {
						grid[y][x] = powerTypes[rand.Intn(3)]
					} else {
						grid[y][x] = 'B'
					}
				}
			}
		}
	}

	// Convert back to strings
	result := make([]string, rows)
	for y, row := range grid {
		result[y] = strings.TrimRight(string(row), "")
	}
	return result
}

// ── Hub ───────────────────────────────────────────────────────────────────────

type Hub struct {
	mu      sync.Mutex
	clients []*Client // all connected, in join order (max 4 in lobby)
	phase   string    // "lobby" | "game"

	cancelCountdown context.CancelFunc // cancels the currently running countdown
}

func newHub() *Hub {
	return &Hub{phase: "lobby"}
}

// register adds a newly connected client and starts lobby logic if needed.
func (h *Hub) register(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.phase == "game" {
		// Game already running — reject late joiners for now
		c.marshalSend(map[string]string{"type": "error", "message": "Game already in progress"})
		close(c.send)
		return
	}

	if len(h.clients) >= 4 {
		c.marshalSend(map[string]string{"type": "error", "message": "Lobby is full"})
		close(c.send)
		return
	}

	h.clients = append(h.clients, c)
	log.Printf("[hub] %s (%s) connected — %d/4", c.id, c.nickname, len(h.clients))

	h.broadcastLobbyLocked(nil)
	h.checkLobbyTimersLocked()
}

// unregister removes a client and cleans up countdown if lobby empties below 2.
func (h *Hub) unregister(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	found := false
	for i, cl := range h.clients {
		if cl == c {
			h.clients = append(h.clients[:i], h.clients[i+1:]...)
			found = true
			break
		}
	}
	if found {
		close(c.send)
	}
	log.Printf("[hub] %s disconnected — %d remaining", c.id, len(h.clients))

	if h.phase == "lobby" {
		h.broadcastLobbyLocked(nil)
		// If we dropped below 2, cancel any running countdown
		if len(h.clients) < 2 && h.cancelCountdown != nil {
			h.cancelCountdown()
			h.cancelCountdown = nil
			h.broadcastLobbyLocked(nil) // send countdown=null
		}
	}
}

// handleMessage processes a raw JSON message from a client.
func (h *Hub) handleMessage(c *Client, raw []byte) {
	var base msgType
	if err := json.Unmarshal(raw, &base); err != nil {
		return
	}

	switch base.Type {
	case "join":
		var m joinMsg
		if err := json.Unmarshal(raw, &m); err != nil {
			return
		}
		h.mu.Lock()
		c.nickname = m.Nickname
		h.mu.Unlock()

		// register now that we have the nickname
		h.register(c)

	case "input":
		h.mu.Lock()
		phase := h.phase
		h.mu.Unlock()
		if phase != "game" {
			return
		}
		var m inputMsg
		if err := json.Unmarshal(raw, &m); err != nil {
			return
		}
		payload := relayInputPayload{
			Type:        "input",
			PlayerIndex: c.playerIndex,
			Dir:         m.Dir,
			DropBomb:    m.DropBomb,
		}
		h.broadcastExcept(c, payload)

	case "chat":
		var m chatMsg
		if err := json.Unmarshal(raw, &m); err != nil {
			return
		}
		h.broadcastAll(relayChatPayload{
			Type:     "chat",
			Nickname: m.Nickname,
			Message:  m.Message,
		})

	case "gameOver":
		var m gameOverMsg
		if err := json.Unmarshal(raw, &m); err != nil {
			return
		}
		h.mu.Lock()
		if h.phase == "game" {
			h.phase = "lobby"
			h.clients = nil
		}
		h.mu.Unlock()
		h.broadcastAll(gameOverPayload{Type: "gameOver", Winner: m.Winner})
	}
}

// ── Lobby timer logic ─────────────────────────────────────────────────────────

// checkLobbyTimersLocked decides whether to start / switch countdown.
// Must be called with h.mu held.
func (h *Hub) checkLobbyTimersLocked() {
	n := len(h.clients)

	if n == 4 {
		// Immediately cancel whatever's running and start 10s ready timer
		if h.cancelCountdown != nil {
			h.cancelCountdown()
		}
		h.startCountdownLocked(10, h.startGameLocked)
		return
	}

	if n == 2 && h.cancelCountdown == nil {
		// First time we have 2 players — start 20s wait timer
		h.startCountdownLocked(20, func() {
			h.mu.Lock()
			defer h.mu.Unlock()
			if len(h.clients) >= 2 {
				h.startCountdownLocked(10, h.startGameLocked)
			}
		})
	}
}

// startCountdownLocked begins a new countdown, broadcasting every second.
// Must be called with h.mu held.
// onExpire is called when the timer reaches 0 (no mutex held at that point).
func (h *Hub) startCountdownLocked(seconds int, onExpire func()) {
	ctx, cancel := context.WithCancel(context.Background())
	h.cancelCountdown = cancel

	go func() {
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		n := seconds
		for {
			// Broadcast current value
			h.mu.Lock()
			h.broadcastLobbyLocked(&n)
			h.mu.Unlock()

			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				n--
				if n <= 0 {
					h.mu.Lock()
					h.broadcastLobbyLocked(&n)
					h.mu.Unlock()
					onExpire()
					return
				}
			}
		}
	}()
}

// startGameLocked transitions to the game phase and sends "start" to each client.
// Called from onExpire callback — must acquire mutex itself.
func (h *Hub) startGameLocked() {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.phase == "game" {
		return // already started
	}
	if len(h.clients) < 2 {
		return // not enough players
	}

	h.phase = "game"
	h.cancelCountdown = nil

	// Assign player indices in join order
	players := make([]lobbyPlayer, len(h.clients))
	for i, c := range h.clients {
		c.playerIndex = i
		players[i] = lobbyPlayer{Nickname: c.nickname, PlayerIndex: i}
	}

	log.Printf("[hub] game starting with %d players", len(h.clients))

	gameMap := generateMap()

	// Send each client their own player index and the shared map
	for _, c := range h.clients {
		c.marshalSend(startPayload{
			Type:            "start",
			YourPlayerIndex: c.playerIndex,
			Players:         players,
			Map:             gameMap,
		})
	}
}

// ── Broadcast helpers ─────────────────────────────────────────────────────────

// broadcastLobbyLocked sends the current lobby state to all clients.
// countdown may be nil (no timer active) or a pointer to remaining seconds.
// Must be called with h.mu held.
func (h *Hub) broadcastLobbyLocked(countdown *int) {
	players := make([]lobbyPlayer, len(h.clients))
	for i, c := range h.clients {
		players[i] = lobbyPlayer{Nickname: c.nickname, PlayerIndex: i}
	}
	payload := lobbyPayload{
		Type:      "lobby",
		Players:   players,
		Countdown: countdown,
	}
	b, _ := json.Marshal(payload)
	for _, c := range h.clients {
		c.enqueue(b)
	}
}

// broadcastAll sends v (marshalled as JSON) to every connected client.
func (h *Hub) broadcastAll(v any) {
	b, err := json.Marshal(v)
	if err != nil {
		log.Printf("broadcastAll marshal: %v", err)
		return
	}
	h.mu.Lock()
	clients := make([]*Client, len(h.clients))
	copy(clients, h.clients)
	h.mu.Unlock()
	for _, c := range clients {
		c.enqueue(b)
	}
}

// broadcastExcept sends v to every client except `exclude`.
func (h *Hub) broadcastExcept(exclude *Client, v any) {
	b, err := json.Marshal(v)
	if err != nil {
		log.Printf("broadcastExcept marshal: %v", err)
		return
	}
	h.mu.Lock()
	clients := make([]*Client, len(h.clients))
	copy(clients, h.clients)
	h.mu.Unlock()
	for _, c := range clients {
		if c != exclude {
			c.enqueue(b)
		}
	}
}
