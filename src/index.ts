import { Midi } from "@tonejs/midi";
import type { Note } from "@tonejs/midi/dist/Note";
import { AmbientLight, Color, DirectionalLight, PerspectiveCamera, Scene, WebGLRenderer } from "three";
import { ACTIVE_BRIGHTNESS, CHANNEL_COLORS, NoteVisualizer } from "./NoteVisualizer";
import { Piano } from "./Piano";
import { Synth } from "./Synth";
import { TIME_SCALE } from "./constants";
import { instruments } from "./instruments";
import { midiInstrumentMap } from "./midiInstruments";
import "./style.css";

interface PlayableNote {
	note: Note;
	channel: number;
}

class MidiVisualizer {
	private scene: Scene;
	private camera: PerspectiveCamera;
	private renderer!: WebGLRenderer;
	private piano: Piano;
	private noteVisualizer: NoteVisualizer;
	private synth: Synth;

	// Playback state
	private isPlaying = false;
	private midiData: Midi | null = null;
	private audioContextStartTime = 0;
	private elapsedTime = 0;
	private notesToPlay: PlayableNote[] = [];
	private nextNoteIndex = 0;
	private activeNotes: Map<string, Note> = new Map();

	// UI Elements
	private playPauseBtn!: HTMLButtonElement;
	private progressBar!: HTMLDivElement;
	private progressElement!: HTMLDivElement;
	private timeDisplay!: HTMLDivElement;
	private uiContainer!: HTMLDivElement;
	private statsDisplay!: HTMLDivElement;
	private fpsDisplay!: HTMLDivElement;
	private instrumentSelectorsContainer!: HTMLDivElement;
	private instrumentSettingsToggle!: HTMLHeadingElement;
	private topDownViewToggle!: HTMLInputElement;
	private matchNoteDurationToggle!: HTMLInputElement;
	private lightweightModeToggle!: HTMLInputElement;
	private pipBtn!: HTMLButtonElement;
	private channelInstruments: Map<number, string> = new Map();
	private channelInitialVolumes: Map<number, number> = new Map();

	// PiP
	private pipVideo!: HTMLVideoElement;

	// Controls state
	private initialPinchDistance = 0;

	// FPS Counter
	private frameCount = 0;
	private lastFPSTime = 0;

	private getInitialLightweightMode(): boolean {
		try {
			const canvas = document.createElement("canvas");
			const gl = canvas.getContext("experimental-webgl") || canvas.getContext("webgl");
			if (gl) {
				// @ts-ignore
				const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
				if (debugInfo) {
					// @ts-ignore
					const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
					if (renderer.toLowerCase().includes("intel")) {
						console.log("Intel GPU detected, enabling lightweight mode by default.");
						return true;
					}
				}
			}
		} catch (e) {
			console.error("Could not detect GPU info, defaulting to non-lightweight mode.", e);
		}
		// Check for power saving mode via battery API
		// This is an async operation, so it's a bit tricky to use for initial sync setup.
		// For now, we rely on the GPU check. A more advanced implementation could
		// update the setting once the battery promise resolves.
		// navigator.getBattery().then(battery => {
		//   if (battery.charging === false && battery.level < 0.5) { // Example condition
		//     // logic to enable lightweight mode
		//   }
		// });

		return false; // Default to false if detection fails or not Intel
	}

	constructor() {
		this.scene = new Scene();
		this.camera = new PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
		this.piano = new Piano();
		this.noteVisualizer = new NoteVisualizer(this.scene, this.piano);
		this.synth = new Synth();

		this.init();
		this.lastFPSTime = performance.now();
		this.animate(this.lastFPSTime);
	}

	private init(): void {
		this.scene.background = new Color(0x2c3e50);

		// Set lightweight mode based on GPU detection before initializing the renderer
		this.lightweightModeToggle = document.getElementById("lightweight-mode-toggle") as HTMLInputElement;
		this.lightweightModeToggle.checked = this.getInitialLightweightMode();
		const isLightweight = this.lightweightModeToggle.checked;

		this.renderer = new WebGLRenderer({ antialias: !isLightweight });
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		this.renderer.setPixelRatio(isLightweight ? 1 : window.devicePixelRatio);
		document.getElementById("webgl-container")?.appendChild(this.renderer.domElement);

		this.camera.position.set(0, 8, 12);
		this.camera.lookAt(0, 0, 0);

		const ambientLight = new AmbientLight(0xffffff, 0.7);
		this.scene.add(ambientLight);
		const directionalLight = new DirectionalLight(0xffffff, 0.9);
		directionalLight.position.set(0, 15, 10);
		this.scene.add(directionalLight);

		this.piano.group.position.z = 2.5;
		this.scene.add(this.piano.group);

		this.uiContainer = document.getElementById("ui-container") as HTMLDivElement;
		this.playPauseBtn = document.getElementById("play-pause-btn") as HTMLButtonElement;
		this.progressBar = document.getElementById("progress-bar") as HTMLDivElement;
		this.progressElement = document.getElementById("progress") as HTMLDivElement;
		this.timeDisplay = document.getElementById("time-display") as HTMLDivElement;
		this.statsDisplay = document.getElementById("stats-display") as HTMLDivElement;
		this.fpsDisplay = document.getElementById("fps-display") as HTMLDivElement;
		this.instrumentSelectorsContainer = document.getElementById("instrument-selectors-container") as HTMLDivElement;
		this.instrumentSettingsToggle = document.getElementById("instrument-settings-toggle") as HTMLHeadingElement;
		this.matchNoteDurationToggle = document.getElementById("match-note-duration-toggle") as HTMLInputElement;
		this.pipBtn = document.getElementById("pip-btn") as HTMLButtonElement;

		this.playPauseBtn.addEventListener("click", () => this.togglePlayback());
		this.pipBtn.addEventListener("click", () => this.togglePiP());
		this.lightweightModeToggle.addEventListener("change", (e) => {
			const isLightweight = (e.target as HTMLInputElement).checked;
			this.recreateRenderer(isLightweight);
		});
		this.instrumentSettingsToggle.addEventListener("click", () => {
			this.instrumentSelectorsContainer.classList.toggle("collapsed");
			const arrow = this.instrumentSettingsToggle.querySelector("span");
			if (arrow) {
				arrow.innerHTML = this.instrumentSelectorsContainer.classList.contains("collapsed") ? "&#x25BC;" : "&#x25B2;";
			}
		});
		this.progressBar.addEventListener("click", (e) => this.handleSeek(e));

		this.topDownViewToggle = document.getElementById("top-down-view-toggle") as HTMLInputElement;
		this.topDownViewToggle.addEventListener("change", (e) => {
			const isTopDown = (e.target as HTMLInputElement).checked;
			if (isTopDown) {
				this.camera.position.set(0, 24, 0);
			} else {
				this.camera.position.set(0, 8, 12);
			}
			this.camera.lookAt(0, 0, 0);
		});

		window.addEventListener("resize", this.onWindowResize.bind(this), false);

		const fileInput = document.getElementById("midi-file") as HTMLInputElement;
		fileInput.addEventListener("change", (event) => this.handleMidiFile(event));

		document.addEventListener("visibilitychange", () => this.handleVisibilityChange());

		this.initPiP();
		this.initDragAndDrop();
		this.initControls();
	}

	private populateChannelInstrumentSelectors(channels: number[]): void {
		this.instrumentSelectorsContainer.innerHTML = ""; // Clear previous selectors

		channels.forEach((channel) => {
			const channelDiv = document.createElement("div");
			channelDiv.className = "channel-instrument-selector";

			const label = document.createElement("label");
			label.textContent = `Ch ${channel + 1}:`;
			label.htmlFor = `instrument-select-ch-${channel}`;
			const color = new Color(CHANNEL_COLORS[channel % CHANNEL_COLORS.length]);
			label.style.color = color.getStyle();
			// Make color slightly less bright for better readability on a light background if needed
			// label.style.textShadow = "0 0 2px #000, 0 0 2px #000"; // Example shadow for readability

			const select = document.createElement("select");
			select.id = `instrument-select-ch-${channel}`;
			select.dataset.channel = channel.toString();

			instruments.forEach((instrument, index) => {
				const option = document.createElement("option");
				option.value = instrument.value;
				option.textContent = instrument.text;
				select.appendChild(option);
			});

			// Set instrument from MIDI data, or default to piano
			const initialInstrument = this.channelInstruments.get(channel) || "piano";
			select.value = initialInstrument;
			this.synth.setInstrument(channel, initialInstrument);
			// Ensure the map is updated in case a default was used
			this.channelInstruments.set(channel, initialInstrument);

			select.addEventListener("change", (e) => {
				const target = e.target as HTMLSelectElement;
				const selectedInstrument = target.value;
				this.channelInstruments.set(channel, selectedInstrument);
				this.synth.setInstrument(channel, selectedInstrument);
			});

			// Volume Slider
			const volumeSlider = document.createElement("input");
			volumeSlider.type = "range";
			volumeSlider.id = `volume-ch-${channel}`;
			volumeSlider.min = "0";
			volumeSlider.max = "1";
			volumeSlider.step = "0.01";
			const initialVolume = this.channelInitialVolumes.get(channel) ?? 0.7;
			volumeSlider.value = initialVolume.toString();
			this.synth.setChannelVolume(channel, initialVolume); // Set initial synth volume
			volumeSlider.addEventListener("input", (e) => {
				const target = e.target as HTMLInputElement;
				const volume = parseFloat(target.value);
				this.synth.setChannelVolume(channel, volume);
				// Added this
				if (volume === 0) {
					this.noteVisualizer.setChannelOpacity(channel, 0.05);
				} else {
					this.noteVisualizer.setChannelOpacity(channel, 0.9);
				}
			});

			channelDiv.appendChild(label);
			channelDiv.appendChild(select);
			channelDiv.appendChild(volumeSlider);
			this.instrumentSelectorsContainer.appendChild(channelDiv);
		});

		// Collapse by default
		this.instrumentSelectorsContainer.classList.add("collapsed");
		const arrow = this.instrumentSettingsToggle.querySelector("span");
		if (arrow) {
			arrow.innerHTML = "&#x25BC;";
		}
	}

	private initControls(): void {
		const container = document.getElementById("webgl-container")!;

		const clampZoom = (z: number) => Math.max(5, Math.min(z, 50));

		// Mouse wheel zoom
		container.addEventListener(
			"wheel",
			(event) => {
				event.preventDefault();
				const zoomSpeed = 0.01;
				this.camera.position.z = clampZoom(this.camera.position.z + event.deltaY * zoomSpeed);
			},
			{ passive: false }
		);

		// Keyboard zoom
		window.addEventListener("keydown", (event) => {
			// Skip playing track
			if (event.key === "ArrowRight") {
				this.skipTime(10);
				return;
			}
			if (event.key === "ArrowLeft") {
				this.skipTime(-10);
				return;
			}

			let zoomAmount = 0;
			if (event.key === "-" || event.key === "_") {
				zoomAmount = 0.5;
			} else if (event.key === "^" || event.key === "+" || event.key === "=") {
				zoomAmount = -0.5;
			}

			if (zoomAmount !== 0) {
				this.camera.position.z = clampZoom(this.camera.position.z + zoomAmount);
			}
		});

		// Touch pinch-to-zoom
		container.addEventListener(
			"touchstart",
			(event) => {
				if (event.touches.length === 2) {
					event.preventDefault();
					this.initialPinchDistance = Math.hypot(event.touches[0].pageX - event.touches[1].pageX, event.touches[0].pageY - event.touches[1].pageY);
				}
			},
			{ passive: false }
		);

		container.addEventListener(
			"touchmove",
			(event) => {
				if (event.touches.length === 2) {
					event.preventDefault();
					const currentPinchDistance = Math.hypot(event.touches[0].pageX - event.touches[1].pageX, event.touches[0].pageY - event.touches[1].pageY);
					const pinchDelta = currentPinchDistance - this.initialPinchDistance;
					const zoomSpeed = 0.05;

					this.camera.position.z = clampZoom(this.camera.position.z - pinchDelta * zoomSpeed);

					// Update initial distance for next move event
					this.initialPinchDistance = currentPinchDistance;
				}
			},
			{ passive: false }
		);

		container.addEventListener("touchend", (event) => {
			if (event.touches.length < 2) {
				this.initialPinchDistance = 0;
			}
		});
	}

	private initDragAndDrop(): void {
		const dropZone = document.body;

		dropZone.addEventListener("dragover", (event) => {
			event.preventDefault();
			dropZone.classList.add("drag-over");
		});

		dropZone.addEventListener("dragleave", () => {
			dropZone.classList.remove("drag-over");
		});

		dropZone.addEventListener("drop", (event) => {
			event.preventDefault();
			dropZone.classList.remove("drag-over");

			if (event.dataTransfer?.files) {
				const file = event.dataTransfer.files[0];
				if (file) {
					this.synth.resumeContext();
					const reader = new FileReader();
					reader.onload = (e) => {
						const arrayBuffer = e.target?.result as ArrayBuffer;
						if (arrayBuffer) this.loadMidi(arrayBuffer);
					};
					reader.readAsArrayBuffer(file);
				}
			}
		});
	}

	private handleMidiFile(event: Event): void {
		this.synth.resumeContext();
		const input = event.target as HTMLInputElement;
		if (!input.files || input.files.length === 0) return;
		const file = input.files[0];
		const reader = new FileReader();
		reader.onload = (e) => {
			const arrayBuffer = e.target?.result as ArrayBuffer;
			if (arrayBuffer) this.loadMidi(arrayBuffer);
		};
		reader.readAsArrayBuffer(file);
	}

	private getInstrumentForTrack(track: Midi["tracks"][0]): string {
		const instrumentName = track.instrument.name.toLowerCase();
		// @ts-ignore
		const mappedInstrument = midiInstrumentMap[instrumentName];
		if (mappedInstrument && instruments.some((i) => i.value === mappedInstrument)) {
			return mappedInstrument;
		}
		// Fallback for similar instruments
		if (instrumentName.includes("piano")) return "piano";
		if (instrumentName.includes("guitar")) return "guitar-acoustic";
		if (instrumentName.includes("bass")) return "bass-electric";
		if (instrumentName.includes("synth")) return "sawtooth";
		return "piano"; // Default fallback
	}

	private async loadMidi(arrayBuffer: ArrayBuffer): Promise<void> {
		try {
			this.midiData = new Midi(arrayBuffer);
			this.noteVisualizer.visualize(this.midiData);
			this.channelInstruments.clear();
			this.channelInitialVolumes.clear();

			const channels = new Set<number>();
			this.midiData.tracks.forEach((track) => {
				if (track.channel !== 9) {
					// Ignore percussion
					channels.add(track.channel);
					const instrument = this.getInstrumentForTrack(track);
					this.channelInstruments.set(track.channel, instrument);

					// Find the last volume control change event (CC7) for this channel
					const volumeChanges = track.controlChanges[7];
					if (volumeChanges && volumeChanges.length > 0) {
						// Get the value of the last volume event in the track
						const lastVolumeEvent = volumeChanges[volumeChanges.length - 1];
						this.channelInitialVolumes.set(track.channel, lastVolumeEvent.value);
					}
				}
			});

			this.notesToPlay = this.midiData.tracks
				.flatMap((track) => {
					// Ignore percussion track for now
					if (track.channel === 9) return [];
					return track.notes.map((note) => ({ note, channel: track.channel }));
				})
				.sort((a, b) => a.note.time - b.note.time);

			this.populateChannelInstrumentSelectors(Array.from(channels).sort((a, b) => a - b));

			this.resetPlayback();
			this.uiContainer.style.display = "flex";
			this.statsDisplay.style.display = "block";
			this.updateUI();
		} catch (error) {
			console.error("Error parsing MIDI file:", error);
			alert("Could not parse the MIDI file. Please try another one.");
		}
	}

	private resetPlayback(): void {
		this.isPlaying = false;
		this.elapsedTime = 0;
		this.audioContextStartTime = 0;
		this.nextNoteIndex = 0;
		this.noteVisualizer.noteObjects.position.z = 0;
		this.playPauseBtn.textContent = "Play";
		if (this.statsDisplay) {
			this.statsDisplay.style.display = "none";
		}

		this.synth.stopAllNotes();
		this.piano.releaseAllKeys();
		this.activeNotes.clear();
		this.noteVisualizer.resetVisuals();
	}

	private togglePlayback(): void {
		if (!this.midiData) return;
		this.synth.resumeContext();
		this.isPlaying = !this.isPlaying;
		if (this.isPlaying) {
			this.audioContextStartTime = this.synth.currentTime - this.elapsedTime;
			this.playPauseBtn.textContent = "Pause";
			this.statsDisplay.style.display = "block";
		} else {
			this.synth.stopAllNotes();
			this.playPauseBtn.textContent = "Play";
		}
	}

	private handleSeek(event: MouseEvent): void {
		if (!this.midiData) return;
		const bounds = this.progressBar.getBoundingClientRect();
		const clickX = event.clientX - bounds.left;
		const width = bounds.width;
		const percentage = clickX / width;
		this.elapsedTime = this.midiData.duration * percentage;
		if (this.isPlaying) {
			this.audioContextStartTime = this.synth.currentTime - this.elapsedTime;
		}

		// Stop all audio and visual feedback
		this.synth.stopAllNotes();
		this.piano.releaseAllKeys();
		this.activeNotes.clear();
		this.noteVisualizer.resetVisuals();

		// Find the next note to be played
		this.nextNoteIndex = this.notesToPlay.findIndex((playableNote) => playableNote.note.time >= this.elapsedTime);
		if (this.nextNoteIndex === -1) this.nextNoteIndex = this.notesToPlay.length;

		// Recover notes that should be active at the seek time
		for (let i = 0; i < this.notesToPlay.length; i++) {
			const { note, channel } = this.notesToPlay[i];
			// A note is active if the seek time is between its start and end times
			if (note.time <= this.elapsedTime && note.time + note.duration > this.elapsedTime) {
				const color = new Color(CHANNEL_COLORS[channel % CHANNEL_COLORS.length]);
				color.addScalar(ACTIVE_BRIGHTNESS);
				this.piano.pressKey(note.midi, color);
				this.activeNotes.set(`${note.midi}-${note.time}-${channel}`, note);
			}
		}
		this.noteVisualizer.update(this.elapsedTime, this.activeNotes);
	}

	private skipTime(seconds: number): void {
		if (!this.midiData) return;

		const newElapsedTime = this.elapsedTime + seconds;
		// Clamp the new time between 0 and the total duration
		this.elapsedTime = Math.max(0, Math.min(this.midiData.duration, newElapsedTime));

		if (this.isPlaying) {
			this.audioContextStartTime = this.synth.currentTime - this.elapsedTime;
		}

		// Stop all audio and visual feedback
		this.synth.stopAllNotes();
		this.piano.releaseAllKeys();
		this.activeNotes.clear();
		this.noteVisualizer.resetVisuals();

		// Find the next note to be played
		this.nextNoteIndex = this.notesToPlay.findIndex((playableNote) => playableNote.note.time >= this.elapsedTime);
		if (this.nextNoteIndex === -1) this.nextNoteIndex = this.notesToPlay.length;

		// Recover notes that should be active at the new time
		for (let i = 0; i < this.notesToPlay.length; i++) {
			const { note, channel } = this.notesToPlay[i];
			if (note.time <= this.elapsedTime && note.time + note.duration > this.elapsedTime) {
				const color = new Color(CHANNEL_COLORS[channel % CHANNEL_COLORS.length]);
				color.addScalar(ACTIVE_BRIGHTNESS);
				this.piano.pressKey(note.midi, color);
				this.activeNotes.set(`${note.midi}-${note.time}-${channel}`, note);
			}
		}
		this.noteVisualizer.update(this.elapsedTime, this.activeNotes);
	}

	private initPiP(): void {
		// Create a video element from the main canvas's stream
		// @ts-ignore
		const stream = this.renderer.domElement.captureStream(60); // 60 fps
		this.pipVideo = document.createElement("video");
		this.pipVideo.srcObject = stream;
		this.pipVideo.muted = true; // Video must be muted to play in background
		this.pipVideo.play();
	}

	private async togglePiP(): Promise<void> {
		if (!document.pictureInPictureEnabled) {
			alert("Picture-in-Picture is not supported in this browser, or is disabled.");
			return;
		}

		try {
			if (document.pictureInPictureElement) {
				await document.exitPictureInPicture();
			} else {
				if (this.pipVideo.readyState === 0) {
					// Video is not ready, maybe user needs to interact first.
					await this.pipVideo.play();
				}
				await this.pipVideo.requestPictureInPicture();
			}
		} catch (error) {
			console.error("Error toggling Picture-in-Picture:", error);
			if (error instanceof Error) {
				alert(`Error entering Picture-in-Picture mode: ${error.message}`);
			} else {
				alert("An unknown error occurred while entering Picture-in-Picture mode.");
			}
		}
	}

	private recreateRenderer(isLightweight: boolean): void {
		// Clean up the old renderer
		if (this.renderer) {
			this.renderer.dispose();
			this.renderer.domElement.parentElement?.removeChild(this.renderer.domElement);
		}

		// Create a new renderer with the updated settings
		this.renderer = new WebGLRenderer({ antialias: !isLightweight });
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		this.renderer.setPixelRatio(isLightweight ? 1 : window.devicePixelRatio);
		document.getElementById("webgl-container")?.appendChild(this.renderer.domElement);

		// Re-initialize components that depend on the renderer's canvas
		this.initPiP();
	}

	private handleVisibilityChange(): void {
		// If the page is hidden, but it's because of PiP, don't pause.
		if (document.hidden && !document.pictureInPictureElement && this.isPlaying) {
			this.togglePlayback();
		}
	}

	private formatTime(seconds: number): string {
		const minutes = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${minutes}:${secs.toString().padStart(2, "0")}`;
	}

	private updateUI(): void {
		if (!this.midiData) return;
		const progress = this.elapsedTime / this.midiData.duration;
		this.progressElement.style.width = `${progress * 100}%`;

		const currentTime = this.formatTime(this.elapsedTime);
		const totalTime = this.formatTime(this.midiData.duration);
		this.timeDisplay.textContent = `${currentTime} / ${totalTime}`;

		// Update note statistics
		const totalNotes = this.notesToPlay.length;
		const playedNotes = this.notesToPlay.filter((p) => p.note.time + p.note.duration < this.elapsedTime).length;
		const percentage = totalNotes > 0 ? ((playedNotes / totalNotes) * 100).toFixed(0) : 0;
		this.statsDisplay.textContent = `Notes: ${playedNotes} / ${totalNotes} (${percentage}%)`;
	}

	private onWindowResize(): void {
		this.camera.aspect = window.innerWidth / window.innerHeight;
		this.camera.updateProjectionMatrix();
		this.renderer.setSize(window.innerWidth, window.innerHeight);
	}

	private updatePlayback(): void {
		if (!this.isPlaying || !this.midiData) return;

		this.elapsedTime = this.synth.currentTime - this.audioContextStartTime;
		if (this.elapsedTime >= this.midiData.duration) {
			this.elapsedTime = this.midiData.duration;
			this.resetPlayback();
			return;
		}

		// Notes ON
		while (this.nextNoteIndex < this.notesToPlay.length && this.notesToPlay[this.nextNoteIndex].note.time <= this.elapsedTime) {
			const { note, channel } = this.notesToPlay[this.nextNoteIndex];
			const matchDuration = this.matchNoteDurationToggle.checked;
			this.synth.playNote(note, channel, matchDuration);

			const color = new Color(CHANNEL_COLORS[channel % CHANNEL_COLORS.length]);
			color.addScalar(ACTIVE_BRIGHTNESS);
			this.piano.pressKey(note.midi, color);

			this.activeNotes.set(`${note.midi}-${note.time}-${channel}`, note);
			this.nextNoteIndex++;
		}

		// Notes OFF
		this.activeNotes.forEach((note, noteKey) => {
			if (note.time + note.duration <= this.elapsedTime) {
				// If match duration is OFF, we manually stop the note.
				// If it's ON, the synth/sampler is responsible for stopping it at the right time.
				if (!this.matchNoteDurationToggle.checked) {
					this.synth.stopNote(note.midi);
				}
				this.piano.releaseKey(note.midi);
				this.activeNotes.delete(noteKey);
			}
		});

		this.noteVisualizer.noteObjects.position.z = this.elapsedTime * TIME_SCALE;
		this.updateUI();
	}

	private updateFPS(now: number): void {
		this.frameCount++;
		if (now >= this.lastFPSTime + 1000) {
			this.fpsDisplay.textContent = `FPS: ${this.frameCount}`;
			this.frameCount = 0;
			this.lastFPSTime = now;
		}
	}

	private animate(now: number): void {
		requestAnimationFrame(this.animate.bind(this));
		this.updateFPS(now);
		this.updatePlayback();
		this.noteVisualizer.update(this.elapsedTime, this.activeNotes);
		this.renderer.render(this.scene, this.camera);
	}
}

new MidiVisualizer();
