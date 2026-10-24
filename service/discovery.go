package service

import (
	"context"

	ctapkit "github.com/telesma-app/kit"
	"github.com/telesma-app/kit/model/failure"
	"github.com/telesma-app/kit/model/report"
	"github.com/telesma-app/kit/transport"
)

// Discover starts device monitoring or republishes its current state. The
// initial state and every later change are published through EventDiscoveryChanged.
func (s *Service) Discover(ctx context.Context) error {
	return s.ensureDeviceManager(ctx)
}

func (s *Service) ensureDeviceManager(ctx context.Context) error {
	unlock, err := s.lockSelection(ctx)
	if err != nil {
		return err
	}
	defer unlock()

	s.mu.Lock()
	if s.devices != nil {
		snapshot := s.sessionSnapshotLocked()
		s.mu.Unlock()
		s.emit(EventDiscoveryChanged, DiscoveryChangedEnvelope{Snapshot: snapshot})

		return nil
	}

	open := s.openDeviceManager
	deviceContext := s.deviceContext
	s.mu.Unlock()

	manager, err := open(deviceContext, transport.ModeAuto, ctapkit.WithLogJournal(s.logs))
	if err != nil {
		return ctapkit.NormalizeError(err, failure.PhaseDiscovery)
	}

	initial, ok := manager.Next()
	if !ok {
		_ = manager.Close()

		return closedServiceError(failure.PhaseDiscovery)
	}

	done := make(chan struct{})

	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()

		_ = manager.Close()

		return closedServiceError(failure.PhaseDiscovery)
	}

	s.devices = manager
	s.devicesDone = done
	s.mu.Unlock()

	snapshot := s.applyDeviceUpdate(initial)

	s.emit(EventDiscoveryChanged, DiscoveryChangedEnvelope{Snapshot: snapshot})
	go s.forwardDeviceUpdates(manager, done)

	return nil
}

func (s *Service) forwardDeviceUpdates(
	manager deviceManagerRuntime,
	done chan struct{},
) {
	defer close(done)

	for {
		update, ok := manager.Next()
		if !ok {
			return
		}

		unlock, err := s.lockSelection(s.deviceContext)
		if err != nil {
			return
		}

		s.mu.Lock()
		current := s.devices
		s.mu.Unlock()

		if current == manager {
			snapshot := s.applyDeviceUpdate(update)
			s.emit(EventDiscoveryChanged, DiscoveryChangedEnvelope{Snapshot: snapshot})
		}

		unlock()
	}
}

func (s *Service) applyDeviceUpdate(
	state deviceManagerState,
) AuthenticatorSessionSnapshot {
	s.reconcileSelection(state.runtime)

	s.mu.Lock()
	s.deviceSnapshot = state.update.Snapshot
	s.deviceError = state.update.Error
	snapshot := s.sessionSnapshotLocked()
	s.mu.Unlock()

	return snapshot
}

func (s *Service) sessionSnapshotLocked() AuthenticatorSessionSnapshot {
	devices := s.deviceSnapshot.Devices
	if devices == nil {
		devices = []report.DeviceReport{}
	}

	endpoints := s.deviceSnapshot.Endpoints
	if endpoints == nil {
		endpoints = []report.EndpointReport{}
	}

	snapshot := AuthenticatorSessionSnapshot{
		Devices:              devices,
		SelectedAttachmentID: s.deviceSnapshot.SelectedEndpoint,
		SelectedDeviceID:     s.deviceSnapshot.Selected,
		Endpoints:            endpoints,
		Error:                s.deviceError,
	}
	if s.selected != nil {
		snapshot.Selection = &ActiveSelection{
			ID:           s.selected.id,
			DeviceID:     s.deviceSnapshot.Selected,
			AttachmentID: s.selected.device.Attachment.ID,
		}
	}

	return snapshot
}

func closedServiceError(phase failure.Phase) error {
	return failure.New(
		failure.CodeOperationCanceled,
		failure.WithPhase(phase),
	)
}
