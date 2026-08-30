package service

import (
	"context"
	"sync"

	"uuid"

	ctapkit "github.com/telesma-app/kit"
	"github.com/telesma-app/kit/model"
	"github.com/telesma-app/kit/model/failure"
	"github.com/telesma-app/kit/model/report"
	"github.com/telesma-app/kit/transport"
)

type EventEmitter interface {
	Emit(name string, payload any)
}

type deviceManagerState struct {
	update  ctapkit.DeviceUpdate
	runtime openedAuthenticator
}

type Option func(*Service)

type deviceManagerRuntime interface {
	Next() (deviceManagerState, bool)
	Select(context.Context, report.AttachmentID) error
	Close() error
}

type openDeviceManagerFunc func(
	context.Context,
	transport.Mode,
	...ctapkit.AuthenticatorOption,
) (deviceManagerRuntime, error)

type Service struct {
	mu                sync.Mutex
	emitter           EventEmitter
	closed            bool
	deviceContext     context.Context
	cancelDevices     context.CancelFunc
	openDeviceManager openDeviceManagerFunc
	devices           deviceManagerRuntime
	devicesDone       chan struct{}
	deviceSnapshot    ctapkit.DeviceSnapshot
	deviceError       *failure.Failure
	selectionGate     chan struct{}

	selected     *selection
	interactions map[InteractionID]*pendingInteraction
	logs         *ctapkit.LogJournal
}

type operationState struct {
	id          OperationID
	selectionID SelectionID
	cancel      context.CancelFunc
	done        chan struct{}
}

type pendingInteraction struct {
	response chan model.InteractionResponse
	done     <-chan struct{}
}

func New(opts ...Option) *Service {
	deviceContext, cancelDevices := context.WithCancel(context.Background())
	service := &Service{
		deviceContext: deviceContext,
		cancelDevices: cancelDevices,
		interactions:  make(map[InteractionID]*pendingInteraction),
		openDeviceManager: func(
			ctx context.Context,
			mode transport.Mode,
			opts ...ctapkit.AuthenticatorOption,
		) (deviceManagerRuntime, error) {
			manager, err := ctapkit.NewDeviceManager(ctx, mode, opts...)
			if err != nil {
				return nil, err
			}

			return managedDevices{manager}, nil
		},
		selectionGate: make(chan struct{}, 1),
		logs:          ctapkit.NewLogJournal(),
	}

	for _, opt := range opts {
		opt(service)
	}

	return service
}

func WithEventEmitter(emitter EventEmitter) Option {
	return func(service *Service) {
		service.emitter = emitter
	}
}

func (s *Service) CancelOperation(req CancelOperationRequest) bool {
	return s.cancelOperation(req.OperationID)
}

func (s *Service) cancelOperation(id OperationID) bool {
	s.mu.Lock()

	selected := s.selected
	var operation *operationState

	if selected != nil {
		operation = selected.operations[id]
	}

	s.mu.Unlock()

	if operation == nil {
		return false
	}

	operation.cancel()

	return true
}

func (s *Service) ResolveInteraction(ctx context.Context, answer InteractionAnswer) (bool, error) {
	s.mu.Lock()

	pending, ok := s.interactions[answer.InteractionID]

	if ok {
		delete(s.interactions, answer.InteractionID)
	}

	s.mu.Unlock()

	if !ok {
		return false, nil
	}

	response := model.InteractionResponse{
		PIN:      []byte(answer.PIN),
		Canceled: answer.Canceled,
	}

	select {
	case pending.response <- response:
		return true, nil
	case <-pending.done:
		clear(response.PIN)

		return false, nil
	case <-ctx.Done():
		clear(response.PIN)

		return false, ctapkit.NormalizeError(ctx.Err(), failure.PhaseInteraction)
	}
}

func (s *Service) retireSelection(selected *selection) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.selected == selected {
		s.selected = nil
	}
}

func (s *Service) registerOperation(selected *selection, operation *operationState) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.closed || s.selected != selected || selected.id != operation.selectionID {
		return false
	}

	selected.operations[operation.id] = operation

	return true
}

func (s *Service) unregisterOperation(selected *selection, id OperationID) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if operation, ok := selected.operations[id]; ok {
		close(operation.done)
	}

	delete(selected.operations, id)
}

func (s *Service) registerInteraction(
	id InteractionID,
	response chan model.InteractionResponse,
	done <-chan struct{},
) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.interactions[id] = &pendingInteraction{
		response: response,
		done:     done,
	}
}

func (s *Service) unregisterInteraction(id InteractionID) {
	s.mu.Lock()
	defer s.mu.Unlock()

	delete(s.interactions, id)
}

func (s *Service) emit(name string, payload any) {
	s.mu.Lock()

	emitter := s.emitter
	closed := s.closed

	s.mu.Unlock()

	if emitter == nil || closed {
		return
	}

	emitter.Emit(name, payload)
}

type operationEventSink struct {
	service   *Service
	operation *operationState
}

func (s operationEventSink) Emit(_ context.Context, event model.OperationEvent) {
	s.service.emitOperationEvent(s.operation, event)
}

func (s *Service) emitOperationEvent(operation *operationState, event model.OperationEvent) {
	s.mu.Lock()

	selected := s.selected
	ok := selected != nil && selected.id == operation.selectionID &&
		selected.operations[operation.id] == operation

	s.mu.Unlock()
	if !ok {
		return
	}

	s.emit(EventOperationEvent, OperationEventEnvelope{
		OperationID: operation.id,
		SelectionID: operation.selectionID,
		Event:       event,
	})
}

type interactionHandler struct {
	service     *Service
	done        <-chan struct{}
	selectionID SelectionID
	operationID OperationID
}

func (h interactionHandler) RequestInteraction(ctx context.Context, req model.InteractionRequest) (model.InteractionResponse, error) {
	prompt := InteractionPrompt{
		InteractionID: InteractionID(uuid.New().String()),
		OperationID:   h.operationID,
		SelectionID:   h.selectionID,
		Request:       req,
	}
	response := make(chan model.InteractionResponse)

	h.service.registerInteraction(prompt.InteractionID, response, h.done)
	h.service.emit(EventInteractionRequested, prompt)
	defer h.service.unregisterInteraction(prompt.InteractionID)

	select {
	case answer := <-response:
		return answer, nil
	case <-ctx.Done():
	case <-h.done:
	}

	return model.InteractionResponse{}, failure.New(failure.CodeInteractionCanceled,
		failure.WithPhase(failure.PhaseInteraction),
	)
}
