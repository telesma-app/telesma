package windowstate

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"

	"telesma/internal/atomicfile"
)

const stateFile = "window-state.json"

type State struct {
	Width     int  `json:"width"`
	Height    int  `json:"height"`
	Maximised bool `json:"maximised"`
}

type Tracker struct {
	mu        sync.Mutex
	state     State
	minWidth  int
	minHeight int
}

func Default(minWidth, minHeight int) State {
	return State{Width: minWidth, Height: minHeight}
}

func Valid(state State, minWidth, minHeight int) bool {
	return state.Width >= minWidth && state.Height >= minHeight
}

func Load(path string, minWidth, minHeight int) State {
	data, err := os.ReadFile(path)
	if err != nil {
		return Default(minWidth, minHeight)
	}

	var state State

	if err := json.Unmarshal(data, &state); err != nil || !Valid(state, minWidth, minHeight) {
		return Default(minWidth, minHeight)
	}

	return state
}

func Save(path string, state State) error {
	data, err := json.Marshal(state)
	if err != nil {
		return err
	}

	return atomicfile.WriteFile(path, data, 0o600, 0o700)
}

func Path() (string, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}

	return filepath.Join(configDir, "Telesma", stateFile), nil
}

func Restore(minWidth, minHeight int) (State, string) {
	path, err := Path()
	if err != nil {
		return Default(minWidth, minHeight), ""
	}

	return Load(path, minWidth, minHeight), path
}

func NewTracker(initial State, minWidth, minHeight int) *Tracker {
	return &Tracker{
		state:     initial,
		minWidth:  minWidth,
		minHeight: minHeight,
	}
}

func (tracker *Tracker) RecordResize(width, height int, minimised, maximised, fullscreen bool) {
	if minimised || fullscreen {
		return
	}

	tracker.mu.Lock()
	defer tracker.mu.Unlock()

	tracker.state.Maximised = maximised
	if maximised || width < tracker.minWidth || height < tracker.minHeight {
		return
	}

	tracker.state.Width = width
	tracker.state.Height = height
}

func (tracker *Tracker) RecordMaximised(maximised, fullscreen bool) {
	if fullscreen {
		return
	}

	tracker.mu.Lock()
	tracker.state.Maximised = maximised
	tracker.mu.Unlock()
}

func (tracker *Tracker) Snapshot() State {
	tracker.mu.Lock()
	defer tracker.mu.Unlock()

	return tracker.state
}
