package windowstate

import (
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

func RecordCurrent(window *application.WebviewWindow, tracker *Tracker) {
	width, height := window.Size()

	tracker.RecordResize(
		width,
		height,
		window.IsMinimised(),
		window.IsMaximised(),
		window.IsFullscreen(),
	)
}

func Track(window *application.WebviewWindow, tracker *Tracker, statePath string) {
	window.OnWindowEvent(events.Common.WindowDidResize, func(_ *application.WindowEvent) {
		RecordCurrent(window, tracker)
	})
	window.OnWindowEvent(events.Common.WindowMaximise, func(_ *application.WindowEvent) {
		tracker.RecordMaximised(true, window.IsFullscreen())
	})
	window.OnWindowEvent(events.Common.WindowUnMaximise, func(_ *application.WindowEvent) {
		tracker.RecordMaximised(false, window.IsFullscreen())
	})
	window.RegisterHook(events.Common.WindowClosing, func(_ *application.WindowEvent) {
		RecordCurrent(window, tracker)

		if statePath != "" {
			_ = Save(statePath, tracker.Snapshot())
		}
	})
}
