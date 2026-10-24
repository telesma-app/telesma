package appconfig

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestApplicationInfoIncludesVersion(t *testing.T) {
	info := (&Service{}).GetApplicationInfo(context.Background())

	if info.Version == "" {
		t.Fatal("application version is empty")
	}
}

func TestMissingConfigUsesDefaults(t *testing.T) {
	service := &Service{path: filepath.Join(t.TempDir(), configFile)}

	snapshot, err := service.LoadApplicationConfig(context.Background())
	if err != nil {
		t.Fatalf("load missing config: %v", err)
	}

	if snapshot.Exists {
		t.Fatal("missing config reported as existing")
	}

	if snapshot.Config != defaultConfig() {
		t.Fatalf("missing config = %#v, want %#v", snapshot.Config, defaultConfig())
	}

	if snapshot.Config.PasskeyDirectoryEnabled {
		t.Fatal("Passkey Directory is enabled by default")
	}
}

func TestConfigRoundTrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), configFile)
	service := &Service{path: path}
	want := ApplicationConfig{
		Locale:                  "ru",
		AdvancedMode:            true,
		PasskeyDirectoryEnabled: true,
	}

	if err := service.SaveApplicationConfig(context.Background(), want); err != nil {
		t.Fatalf("save config: %v", err)
	}

	snapshot, err := service.LoadApplicationConfig(context.Background())
	if err != nil {
		t.Fatalf("load config: %v", err)
	}

	if !snapshot.Exists {
		t.Fatal("saved config reported as missing")
	}

	if snapshot.Config != want {
		t.Fatalf("loaded config = %#v, want %#v", snapshot.Config, want)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read saved config: %v", err)
	}

	contents := string(data)

	if !strings.Contains(contents, "locale") ||
		!strings.Contains(contents, "advanced_mode") ||
		!strings.Contains(contents, "passkey_directory_enabled") {
		t.Fatalf("saved TOML does not contain application config keys: %q", contents)
	}
}

func TestConfigRejectsInvalidInput(t *testing.T) {
	tests := map[string]string{
		"unsupported locale": "locale = \"de\"\n",
		"invalid TOML":       "locale = \"ru\n",
		"duplicate key":      "locale = \"en\"\nlocale = \"ru\"\n",
		"unknown key":        "locale = \"en\"\ntheme = \"dark\"\n",
	}

	for name, contents := range tests {
		t.Run(name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), configFile)

			if err := os.WriteFile(path, []byte(contents), 0o600); err != nil {
				t.Fatalf("write config: %v", err)
			}

			service := &Service{path: path}
			if _, err := service.LoadApplicationConfig(context.Background()); err == nil {
				t.Fatal("load invalid config succeeded")
			}
		})
	}
}

func TestConfigRejectsInvalidSave(t *testing.T) {
	service := &Service{path: filepath.Join(t.TempDir(), configFile)}
	err := service.SaveApplicationConfig(context.Background(), ApplicationConfig{Locale: "de"})

	if err == nil || !strings.Contains(err.Error(), "unsupported locale") {
		t.Fatalf("save error = %v, want unsupported locale", err)
	}
}
