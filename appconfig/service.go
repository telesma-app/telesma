package appconfig

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/pelletier/go-toml/v2"

	"telesma/internal/atomicfile"
	"telesma/internal/buildinfo"
)

const configFile = "config.toml"

type ApplicationConfig struct {
	Locale                  string `json:"locale" toml:"locale"`
	AdvancedMode            bool   `json:"advancedMode" toml:"advanced_mode"`
	PasskeyDirectoryEnabled bool   `json:"passkeyDirectoryEnabled" toml:"passkey_directory_enabled"`
}

type ApplicationConfigSnapshot struct {
	Config ApplicationConfig `json:"config"`
	Exists bool              `json:"exists"`
}

type ApplicationInfo struct {
	Version string `json:"version"`
}

type Service struct {
	mu      sync.Mutex
	path    string
	pathErr error
}

func NewService() *Service {
	path, err := configPath()

	return &Service{path: path, pathErr: err}
}

func (s *Service) ServiceName() string {
	return "ApplicationService"
}

func (s *Service) LoadApplicationConfig(_ context.Context) (ApplicationConfigSnapshot, error) {
	return s.load()
}

func (s *Service) GetApplicationInfo(_ context.Context) ApplicationInfo {
	return ApplicationInfo{Version: buildinfo.Version}
}

func (s *Service) SaveApplicationConfig(_ context.Context, config ApplicationConfig) error {
	return s.save(config)
}

func defaultConfig() ApplicationConfig {
	return ApplicationConfig{Locale: "en"}
}

func validate(config ApplicationConfig) error {
	switch config.Locale {
	case "en", "ru":
		return nil
	default:
		return fmt.Errorf("unsupported locale %q", config.Locale)
	}
}

func configPath() (string, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}

	return filepath.Join(configDir, "Telesma", configFile), nil
}

func (s *Service) load() (ApplicationConfigSnapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.pathErr != nil {
		return ApplicationConfigSnapshot{}, s.pathErr
	}

	data, err := os.ReadFile(s.path)

	if errors.Is(err, os.ErrNotExist) {
		return ApplicationConfigSnapshot{Config: defaultConfig()}, nil
	}

	if err != nil {
		return ApplicationConfigSnapshot{}, err
	}

	config, err := decode(data)
	if err != nil {
		return ApplicationConfigSnapshot{}, fmt.Errorf("decode application config: %w", err)
	}

	return ApplicationConfigSnapshot{Config: config, Exists: true}, nil
}

func (s *Service) save(config ApplicationConfig) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.pathErr != nil {
		return s.pathErr
	}

	if err := validate(config); err != nil {
		return err
	}

	data, err := toml.Marshal(config)
	if err != nil {
		return err
	}

	return atomicfile.WriteFile(s.path, data, 0o600, 0o700)
}

func decode(data []byte) (ApplicationConfig, error) {
	config := defaultConfig()

	if err := toml.NewDecoder(bytes.NewReader(data)).DisallowUnknownFields().Decode(&config); err != nil {
		return ApplicationConfig{}, err
	}

	if err := validate(config); err != nil {
		return ApplicationConfig{}, err
	}

	return config, nil
}
