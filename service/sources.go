package service

import (
	"context"

	"github.com/telesma-app/kit/model/failure"
	"github.com/telesma-app/mds"
)

// ReadSources reads local observations independently of CTAP workflow readiness.
// Source outcomes are published through session snapshots.
func (s *Service) ReadSources(ctx context.Context, req SelectionRequest) error {
	manager, err := s.deviceManager()
	if err != nil {
		return err
	}

	return manager.RefreshSources(ctx, req.DeviceID)
}

// RefreshMetadata refreshes the attachment's AAGUID lookup without running a
// CTAP workflow. Source outcomes are published through session snapshots.
func (s *Service) RefreshMetadata(ctx context.Context, req MetadataRequest) error {
	manager, err := s.deviceManager()
	if err != nil {
		return err
	}

	_, err = manager.RefreshMetadata(ctx, req.AttachmentID, &mds.Client{}, mds.LookupOptions{Refresh: req.Refresh})

	return err
}

func (s *Service) deviceManager() (deviceManagerRuntime, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.devices == nil {
		return nil, failure.New(failure.CodeDeviceNotFound, failure.WithPhase(failure.PhaseDiscovery))
	}

	return s.devices, nil
}
