package service

import (
	"context"
	"sync"
	"testing"

	"github.com/telesma-app/kit/model"
)

func TestOperationEventEmitsWithoutWritingApplicationJournalEntry(t *testing.T) {
	emitter := newCountingEmitter()
	service := New(WithEventEmitter(emitter))

	service.selected = newSelection("selection-1", openedAuthenticator{})

	operation := &operationState{
		id:          "operation-1",
		selectionID: "selection-1",
	}

	service.selected.operations[operation.id] = operation

	operationEventSink{service: service, operation: operation}.Emit(t.Context(), model.OperationEvent{
		Stage: model.OperationStageEnumeratingCredentials,
	})

	if got := emitter.count(EventOperationEvent); got != 1 {
		t.Fatalf("operation event count = %d, want 1", got)
	}

	if logs := service.ReadLogs(ReadLogsRequest{}).Entries; len(logs) != 0 {
		t.Fatalf("application journal entries = %#v, want none", logs)
	}
}

func TestInteractionEmitsWithoutWritingApplicationJournalEntry(t *testing.T) {
	emitter := newCountingEmitter()
	service := New(WithEventEmitter(emitter))
	done := make(chan struct{})

	service.selected = newSelection("selection-1", openedAuthenticator{})
	service.selected.operations["operation-1"] = &operationState{
		id:          "operation-1",
		selectionID: "selection-1",
		done:        done,
	}

	handler := interactionHandler{
		service:     service,
		done:        done,
		selectionID: "selection-1",
		operationID: "operation-1",
	}

	result := make(chan error, 1)

	go func() {
		answer, err := handler.RequestInteraction(t.Context(), model.InteractionRequest{Kind: model.InteractionKindPIN})

		clear(answer.PIN)

		result <- err
	}()

	prompt := <-emitter.prompts
	resolved, err := service.ResolveInteraction(context.Background(), InteractionAnswer{
		InteractionID: prompt.InteractionID,
		PIN:           "sentinel-interaction-pin-8301",
	})

	if err != nil || !resolved {
		t.Fatalf("ResolveInteraction = %v, %v", resolved, err)
	}

	if err := <-result; err != nil {
		t.Fatalf("RequestInteraction: %v", err)
	}

	if got := emitter.count(EventInteractionRequested); got != 1 {
		t.Fatalf("interaction event count = %d, want 1", got)
	}

	if logs := service.ReadLogs(ReadLogsRequest{}).Entries; len(logs) != 0 {
		t.Fatalf("application journal entries = %#v, want none", logs)
	}
}

type countingEmitter struct {
	mu      sync.Mutex
	names   []string
	prompts chan InteractionPrompt
}

func newCountingEmitter() *countingEmitter {
	return &countingEmitter{prompts: make(chan InteractionPrompt, 1)}
}

func (e *countingEmitter) Emit(name string, payload any) {
	e.mu.Lock()
	e.names = append(e.names, name)
	e.mu.Unlock()

	if prompt, ok := payload.(InteractionPrompt); ok {
		e.prompts <- prompt
	}
}

func (e *countingEmitter) count(name string) int {
	e.mu.Lock()
	defer e.mu.Unlock()

	count := 0

	for _, candidate := range e.names {
		if candidate == name {
			count++
		}
	}

	return count
}
