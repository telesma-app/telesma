package atomicfile

import (
	"io/fs"
	"os"
	"path/filepath"
)

// WriteFile atomically replaces path with data using a temporary file in the
// same directory. The parent directory is created with dirPerm when needed.
func WriteFile(path string, data []byte, filePerm, dirPerm fs.FileMode) error {
	dir := filepath.Dir(path)

	if err := os.MkdirAll(dir, dirPerm); err != nil {
		return err
	}

	tempFile, err := os.CreateTemp(dir, "."+filepath.Base(path)+".tmp-*")
	if err != nil {
		return err
	}

	tempPath := tempFile.Name()

	defer func() { _ = os.Remove(tempPath) }()

	if err := tempFile.Chmod(filePerm); err != nil {
		_ = tempFile.Close()

		return err
	}

	if _, err := tempFile.Write(data); err != nil {
		_ = tempFile.Close()

		return err
	}

	if err := tempFile.Sync(); err != nil {
		_ = tempFile.Close()

		return err
	}

	if err := tempFile.Close(); err != nil {
		return err
	}

	return os.Rename(tempPath, path)
}
