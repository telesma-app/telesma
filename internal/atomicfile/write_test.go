package atomicfile

import (
	"os"
	"path/filepath"
	"testing"
)

func TestWriteFileReplacesTarget(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "nested", "state.json")

	if err := WriteFile(path, []byte("first"), 0o600, 0o700); err != nil {
		t.Fatalf("write initial file: %v", err)
	}

	if err := WriteFile(path, []byte("second"), 0o600, 0o700); err != nil {
		t.Fatalf("replace file: %v", err)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read replaced file: %v", err)
	}

	if got := string(data); got != "second" {
		t.Fatalf("replaced contents = %q, want second", got)
	}

	if info, err := os.Stat(path); err != nil {
		t.Fatalf("stat replaced file: %v", err)
	} else if info.Mode().Perm() != 0o600 {
		t.Fatalf("file permissions = %o, want 600", info.Mode().Perm())
	}

	assertNoTemporaryFiles(t, filepath.Dir(path), filepath.Base(path))
}

func TestWriteFileKeepsTargetOnReplacementFailure(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "state.json")

	if err := os.Mkdir(path, 0o700); err != nil {
		t.Fatalf("create replacement-blocking target: %v", err)
	}

	err := WriteFile(path, []byte("state"), 0o600, 0o700)
	if err == nil {
		t.Fatal("write succeeded with a directory as its target")
	}

	if info, statErr := os.Stat(path); statErr != nil {
		t.Fatalf("stat original target: %v", statErr)
	} else if !info.IsDir() {
		t.Fatal("original target was replaced after failed write")
	}

	assertNoTemporaryFiles(t, dir, filepath.Base(path))
}

func assertNoTemporaryFiles(t *testing.T, dir, target string) {
	t.Helper()

	temporary, err := filepath.Glob(filepath.Join(dir, "."+target+".tmp-*"))
	if err != nil {
		t.Fatalf("find temporary files: %v", err)
	}

	if len(temporary) != 0 {
		t.Fatalf("temporary files remain: %v", temporary)
	}
}
