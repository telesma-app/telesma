//go:build hardware

package service

import (
	"context"
	"encoding/json"
	"testing"
	"time"
)

type diagnosticEmitter struct {
	events chan DiscoveryChangedEnvelope
}

func (e diagnosticEmitter) Emit(name string, payload any) {
	if name != EventDiscoveryChanged {
		return
	}

	event, ok := payload.(DiscoveryChangedEnvelope)
	if !ok {
		return
	}

	select {
	case e.events <- event:
	default:
	}
}

func TestDiagnosticWindowsColdStart(t *testing.T) {
	for attempt := 1; attempt <= 5; attempt++ {
		emitter := diagnosticEmitter{events: make(chan DiscoveryChangedEnvelope, 32)}
		runtime := New(WithEventEmitter(emitter))
		ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)

		err := runtime.Discover(ctx)
		var snapshot AuthenticatorSessionSnapshot
		if err == nil {
			select {
			case event := <-emitter.events:
				snapshot = event.Snapshot
			case <-ctx.Done():
				err = ctx.Err()
			}
		}
		logDiagnosticValue(t, attempt, "initial", snapshot, err)

		timer := time.NewTimer(2250 * time.Millisecond)
	collect:
		for {
			select {
			case event := <-emitter.events:
				logDiagnosticValue(t, attempt, "update", event.Snapshot, nil)
			case <-timer.C:
				break collect
			}
		}

		cancel()
		if err := runtime.close(); err != nil {
			t.Logf("attempt=%d close_error=%v", attempt, err)
		}
	}
}

func logDiagnosticValue(
	t *testing.T,
	attempt int,
	stage string,
	snapshot AuthenticatorSessionSnapshot,
	err error,
) {
	t.Helper()

	encoded, marshalErr := json.Marshal(snapshot)
	if marshalErr != nil {
		t.Fatalf("marshal diagnostic snapshot: %v", marshalErr)
	}

	t.Logf("attempt=%d stage=%s error=%v snapshot=%s", attempt, stage, err, encoded)
}
