package service

import (
	"context"
	"errors"

	"uuid"

	ctapkit "github.com/telesma-app/kit"
	"github.com/telesma-app/kit/model/failure"
	"github.com/telesma-app/kit/model/report"
)

type selection struct {
	id         SelectionID
	device     report.DeviceReport
	runtime    openedAuthenticator
	operations map[OperationID]*operationState
}

type authenticatorLifecycle interface {
	Close() error
	Closed() bool
}

type openedAuthenticator struct {
	client    *ctapkit.Authenticator
	lifecycle authenticatorLifecycle
	device    report.DeviceReport
}

func newOpenedAuthenticator(client *ctapkit.Authenticator) openedAuthenticator {
	return openedAuthenticator{
		client:    client,
		lifecycle: client,
		device:    client.Device(),
	}
}

func (a openedAuthenticator) Close() error {
	return a.lifecycle.Close()
}

func (a openedAuthenticator) Closed() bool {
	return a.lifecycle.Closed()
}

func (a openedAuthenticator) same(other openedAuthenticator) bool {
	if a.client != nil || other.client != nil {
		return a.client == other.client
	}

	return a.lifecycle == other.lifecycle
}

type managedDevices struct {
	manager *ctapkit.DeviceManager
}

func managedDeviceState(update ctapkit.DeviceUpdate) deviceManagerState {
	state := deviceManagerState{update: update}
	if update.Selected != nil {
		state.runtime = newOpenedAuthenticator(update.Selected)
	}

	return state
}

func (m managedDevices) Next() (deviceManagerState, bool) {
	update, ok := <-m.manager.Updates()
	if !ok {
		return deviceManagerState{}, false
	}

	return managedDeviceState(update), true
}

func (m managedDevices) Select(ctx context.Context, id report.AttachmentID) error {
	return m.manager.Select(ctx, id)
}

func (m managedDevices) Close() error {
	return m.manager.Close()
}

func newSelection(id SelectionID, runtime openedAuthenticator) *selection {
	return &selection{
		id:         id,
		device:     runtime.device,
		runtime:    runtime,
		operations: make(map[OperationID]*operationState),
	}
}

func (s *Service) SetSelection(
	ctx context.Context,
	req SelectionRequest,
) error {
	if req.AttachmentID == "" {
		return failure.New(
			failure.CodeDeviceNotFound,
			failure.WithPhase(failure.PhaseAuthenticator),
		)
	}

	unlock, err := s.lockSelection(ctx)
	if err != nil {
		return err
	}
	defer unlock()

	s.mu.Lock()
	manager := s.devices
	s.mu.Unlock()
	if manager == nil {
		return failure.New(
			failure.CodeDeviceNotFound,
			failure.WithPhase(failure.PhaseDiscovery),
		)
	}

	return manager.Select(ctx, req.AttachmentID)
}

func (s *Service) ReconnectSelection(
	ctx context.Context,
) error {
	s.mu.Lock()
	selected := s.selected
	s.mu.Unlock()
	if selected == nil {
		return nil
	}

	return s.restartDeviceManager(ctx, selected.device.Attachment.ID)
}

func (s *Service) reconcileSelection(runtime openedAuthenticator) {
	current := s.currentSelection()
	if current != nil && runtime.lifecycle != nil && current.runtime.same(runtime) {
		s.mu.Lock()
		current.device = runtime.device
		s.mu.Unlock()

		return
	}

	if current != nil {
		s.retireSelection(current)
		s.cancelAndWait(current)
	}
	if runtime.lifecycle == nil {
		return
	}

	selected := newSelection(SelectionID(uuid.New().String()), runtime)
	s.mu.Lock()
	if !s.closed {
		s.selected = selected
	}
	s.mu.Unlock()
}

func (s *Service) restartDeviceManager(
	ctx context.Context,
	preferred report.AttachmentID,
) error {
	unlock, err := s.lockSelection(ctx)
	if err != nil {
		return err
	}

	s.mu.Lock()
	manager := s.devices
	done := s.devicesDone
	selected := s.selected
	s.devices = nil
	s.devicesDone = nil
	s.deviceSnapshot = ctapkit.DeviceSnapshot{}
	s.deviceError = nil
	s.selected = nil
	s.mu.Unlock()

	var closeErr error
	if manager != nil {
		closeErr = manager.Close()
	}
	if selected != nil {
		s.cancelAndWait(selected)
	}
	unlock()
	if done != nil {
		<-done
	}

	if err := s.ensureDeviceManager(ctx); err != nil {
		return errors.Join(closeErr, err)
	}

	if preferred != "" {
		selectErr := s.SetSelection(
			ctx,
			SelectionRequest{AttachmentID: preferred},
		)
		closeErr = errors.Join(closeErr, selectErr)
	}

	return closeErr
}

func (s *Service) close() error {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()

		return nil
	}
	s.closed = true
	s.cancelDevices()
	s.mu.Unlock()

	s.selectionGate <- struct{}{}

	s.mu.Lock()
	selected := s.selected
	s.selected = nil
	manager := s.devices
	done := s.devicesDone
	s.mu.Unlock()

	var closeErr error
	if manager != nil {
		closeErr = manager.Close()
	}
	if selected != nil {
		s.cancelAndWait(selected)
	}

	<-s.selectionGate
	if done != nil {
		<-done
	}

	return closeErr
}

func (s *Service) currentSelection() *selection {
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.selected
}

func (s *Service) lockSelection(ctx context.Context) (func(), error) {
	select {
	case s.selectionGate <- struct{}{}:
		s.mu.Lock()
		closed := s.closed
		s.mu.Unlock()
		if closed {
			<-s.selectionGate

			return nil, closedServiceError(failure.PhaseAuthenticator)
		}

		return func() { <-s.selectionGate }, nil
	case <-ctx.Done():
		return nil, ctapkit.NormalizeError(ctx.Err(), failure.PhaseAuthenticator)
	}
}

func (s *Service) cancelAndWait(selected *selection) {
	s.mu.Lock()
	operations := make([]*operationState, 0, len(selected.operations))
	for _, operation := range selected.operations {
		operations = append(operations, operation)
	}
	s.mu.Unlock()

	for _, operation := range operations {
		operation.cancel()
	}
	for _, operation := range operations {
		<-operation.done
	}
}
