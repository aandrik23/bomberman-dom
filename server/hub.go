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
	Dir struct {
		Dx int `json:"dx"`
		Dy int `json:"dy"`
	} `json:"dir"`
	DropBomb bool `json:"dropBomb"`
}

type stateMsg struct {
	X       int     `json:"x"`
	Y       int     `json:"y"`
	PosX    float64 `json:"posX"`
	PosY    float64 `json:"posY"`
	TargetX int     `json:"targetX"`
	TargetY int     `json:"targetY"`
	Dir     struct {
		Dx int `json:"dx"`
		Dy int `json:"dy"`
	} `json:"dir"`
	NextDir struct {
		Dx int `json:"dx"`
		Dy int `json:"dy"`
	} `json:"nextDir"`
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
	Phase     string        `json:"phase"`     // "waiting" | "ready" | ""
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

type relayStatePayload struct {
	Type        string  `json:"type"`
	PlayerIndex int     `json:"playerIndex"`
	X           int     `json:"x"`
	Y           int     `json:"y"`
	PosX        float64 `json:"posX"`
	PosY        float64 `json:"posY"`
	TargetX     int     `json:"targetX"`
	TargetY     int     `json:"targetY"`
	Dir         struct {
		Dx int `json:"dx"`
		Dy int `json:"dy"`
	} `json:"dir"`
	NextDir struct {
		Dx int `json:"dx"`
		Dy int `json:"dy"`
	} `json:"nextDir"`
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

type playerLeftPayload struct {
	Type        string `json:"type"`
	PlayerIndex int    `json:"playerIndex"`
	Nickname    string `json:"nickname"`
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
			if c == 'B' && !safe[[2]int{x, y}] {
				if rand.Float64() < 0.5 {
					grid[y][x] = powerTypes[rand.Intn(3)]
				}
				continue
			}
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

	// Timer state
	timerPhase      string             // "none" | "waiting" (20s) | "ready" (10s)
	locked          bool               // true during 10s ready countdown — no joins or leaves
	cancelCountdown context.CancelFunc // cancels the currently running countdown
}

func newHub() *Hub {
	return &Hub{phase: "lobby", timerPhase: "none"}
}

// register adds a newly connected client and restarts the 20s waiting timer.
func (h *Hub) register(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.phase == "game" {
		c.marshalSend(map[string]string{"type": "error", "message": "Game already in progress"})
		close(c.send)
		return
	}

	if h.locked {
		c.marshalSend(map[string]string{"type": "error", "message": "Lobby locked — Game starting soon"})
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

// unregister removes a client and handles timer/game state accordingly.
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
	if !found {
		return
	}
	close(c.send)
	log.Printf("[hub] %s disconnected — %d remaining", c.id, len(h.clients))

	if h.phase == "game" {
		// Notify remaining players that this player left
		if len(h.clients) >= 1 {
			b, _ := json.Marshal(playerLeftPayload{
				Type:        "playerLeft",
				PlayerIndex: c.playerIndex,
				Nickname:    c.nickname,
			})
			for _, cl := range h.clients {
				cl.enqueue(b)
			}
		}
		// Last player standing wins automatically
		if len(h.clients) == 1 {
			winner := h.clients[0]
			h.phase = "lobby"
			h.clients = nil
			b, _ := json.Marshal(gameOverPayload{Type: "gameOver", Winner: winner.playerIndex})
			winner.enqueue(b)
		}
		return
	}

	// Lobby phase — 10s ready countdown is locked, only cancel if too few players remain
	if h.timerPhase == "ready" {
		if len(h.clients) < 2 {
			if h.cancelCountdown != nil {
				h.cancelCountdown()
				h.cancelCountdown = nil
			}
			h.timerPhase = "none"
			h.locked = false
			h.broadcastLobbyLocked(nil)
		}
		// Otherwise let the 10s timer continue with the remaining players
		return
	}

	// Waiting phase (20s) — reset the timer on every join/leave
	h.broadcastLobbyLocked(nil)
	h.checkLobbyTimersLocked()
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

	case "state":
		h.mu.Lock()
		phase := h.phase
		h.mu.Unlock()
		if phase != "game" {
			return
		}
		var m stateMsg
		if err := json.Unmarshal(raw, &m); err != nil {
			return
		}
		payload := relayStatePayload{
			Type:        "state",
			PlayerIndex: c.playerIndex,
			X:           m.X,
			Y:           m.Y,
			PosX:        m.PosX,
			PosY:        m.PosY,
			TargetX:     m.TargetX,
			TargetY:     m.TargetY,
			Dir:         m.Dir,
			NextDir:     m.NextDir,
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

// checkLobbyTimersLocked decides whether to start / reset / switch countdown.
// Must be called with h.mu held.
func (h *Hub) checkLobbyTimersLocked() {
	n := len(h.clients)

	// Never interrupt the locked 10s ready phase
	if h.timerPhase == "ready" {
		return
	}

	// Not enough players — cancel any timer
	if n < 2 {
		if h.cancelCountdown != nil {
			h.cancelCountdown()
			h.cancelCountdown = nil
		}
		h.timerPhase = "none"
		h.broadcastLobbyLocked(nil)
		return
	}

	// Full lobby — skip waiting, go straight to 10s ready phase
	if n == 4 {
		if h.cancelCountdown != nil {
			h.cancelCountdown()
			h.cancelCountdown = nil
		}
		h.timerPhase = "ready"
		h.locked = true
		h.startCountdownLocked(10, h.startGameLocked)
		return
	}

	// 2 or 3 players: (re)start the 20s waiting timer.
	// This resets the timer every time a player joins or leaves.
	if h.cancelCountdown != nil {
		h.cancelCountdown()
		h.cancelCountdown = nil
	}
	h.timerPhase = "waiting"
	h.startCountdownLocked(20, func() {
		h.mu.Lock()
		defer h.mu.Unlock()
		// Only advance to ready if still in waiting phase and have enough players
		if h.timerPhase == "waiting" && len(h.clients) >= 2 {
			h.timerPhase = "ready"
			h.locked = true
			h.startCountdownLocked(10, h.startGameLocked)
		}
	})
}

// startCountdownLocked begins a new countdown, broadcasting every second.
// Must be called with h.mu held.
func (h *Hub) startCountdownLocked(seconds int, onExpire func()) {
	ctx, cancel := context.WithCancel(context.Background())
	h.cancelCountdown = cancel

	go func() {
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		n := seconds
		for {
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
// Called from onExpire — must acquire mutex itself.
func (h *Hub) startGameLocked() {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.phase == "game" {
		return
	}
	if len(h.clients) < 2 {
		h.locked = false
		h.timerPhase = "none"
		h.cancelCountdown = nil
		return
	}

	h.phase = "game"
	h.locked = false
	h.timerPhase = "none"
	h.cancelCountdown = nil

	players := make([]lobbyPlayer, len(h.clients))
	for i, c := range h.clients {
		c.playerIndex = i
		players[i] = lobbyPlayer{Nickname: c.nickname, PlayerIndex: i}
	}

	log.Printf("[hub] game starting with %d players", len(h.clients))

	gameMap := generateMap()

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
// Must be called with h.mu held.
func (h *Hub) broadcastLobbyLocked(countdown *int) {
	players := make([]lobbyPlayer, len(h.clients))
	for i, c := range h.clients {
		players[i] = lobbyPlayer{Nickname: c.nickname, PlayerIndex: i}
	}
	phase := ""
	if countdown != nil {
		phase = h.timerPhase
	}
	payload := lobbyPayload{
		Type:      "lobby",
		Players:   players,
		Countdown: countdown,
		Phase:     phase,
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
