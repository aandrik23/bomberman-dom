package main

import (
	"encoding/json"
	"log"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait  = 10 * time.Second
	pongWait   = 60 * time.Second
	pingPeriod = (pongWait * 9) / 10
	maxMsgSize = 4096
)

// Client represents one connected browser tab.
type Client struct {
	hub         *Hub
	conn        *websocket.Conn
	send        chan []byte
	id          string // unique ID assigned on connect
	nickname    string
	playerIndex int // -1 until assigned in game start
}

func newClient(hub *Hub, conn *websocket.Conn, id string) *Client {
	return &Client{
		hub:         hub,
		conn:        conn,
		send:        make(chan []byte, 256),
		id:          id,
		playerIndex: -1,
	}
}

// readPump pumps messages from the WebSocket to the hub.
// Runs in its own goroutine per client.
func (c *Client) readPump() {
	defer func() {
		c.hub.unregister(c)
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMsgSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, raw, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("client %s read error: %v", c.id, err)
			}
			break
		}
		c.hub.handleMessage(c, raw)
	}
}

// writePump pumps messages from the send channel to the WebSocket.
// Runs in its own goroutine per client.
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case msg, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// enqueue safely queues a message for sending, dropping if the buffer is full.
func (c *Client) enqueue(data []byte) {
	select {
	case c.send <- data:
	default:
		log.Printf("client %s send buffer full — dropping message", c.id)
	}
}

// marshalSend encodes v as JSON and enqueues it.
func (c *Client) marshalSend(v any) {
	b, err := json.Marshal(v)
	if err != nil {
		log.Printf("marshalSend: %v", err)
		return
	}
	c.enqueue(b)
}
