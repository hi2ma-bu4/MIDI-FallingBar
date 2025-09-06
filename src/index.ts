import { Midi } from "@tonejs/midi";
import type { Note } from "@tonejs/midi/dist/Note";
import { AmbientLight, Clock, Color, DirectionalLight, PerspectiveCamera, Scene, WebGLRenderer } from "three";
import { NoteVisualizer } from "./NoteVisualizer";
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
	private renderer: WebGLRenderer;
	private piano: Piano;
	private noteVisualizer: NoteVisualizer;
	private synth: Synth;

	// Playback state
	private clock: Clock;
	private isPlaying = false;
	private midiData: Midi | null = null;
	private playbackStartTime = 0;
	private elapsedTime = 0;
	private notesToPlay: PlayableNote[] = [];
	private nextNoteIndex = 0;
	private activeNotes: Map<number, Note> = new Map();

	// UI Elements
	private playPauseBtn!: HTMLButtonElement;
	private progressBar!: HTMLDivElement;
	private progressElement!: HTMLDivElement;
	private timeDisplay!: HTMLDivElement;
	private uiContainer!: HTMLDivElement;
	private statsDisplay!: HTMLDivElement;
	private instrumentSelectorsContainer!: HTMLDivElement;
	private instrumentSettingsToggle!: HTMLHeadingElement;
	private topDownViewToggle!: HTMLInputElement;
	private matchNoteDurationToggle!: HTMLInputElement;
	private pipBtn!: HTMLButtonElement;
	private channelInstruments: Map<number, string> = new Map();
	private channelInitialVolumes: Map<number, number> = new Map();

	// PiP
	private pipCanvas!: HTMLCanvasElement;
	private pipVideo!: HTMLVideoElement;

	// Controls state
	private initialPinchDistance = 0;

	constructor() {
		this.scene = new Scene();
		this.camera = new PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
		this.renderer = new WebGLRenderer({ antialias: true });
		this.piano = new Piano();
		this.noteVisualizer = new NoteVisualizer(this.scene, this.piano);
		this.synth = new Synth();
		this.clock = new Clock();

		this.init();
		this.animate();
	}

	private init(): void {
		this.scene.background = new Color(0x2c3e50);
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		this.renderer.setPixelRatio(window.devicePixelRatio);
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
		this.instrumentSelectorsContainer = document.getElementById("instrument-selectors-container") as HTMLDivElement;
		this.instrumentSettingsToggle = document.getElementById("instrument-settings-toggle") as HTMLHeadingElement;
		this.matchNoteDurationToggle = document.getElementById("match-note-duration-toggle") as HTMLInputElement;
		this.pipBtn = document.getElementById("pip-btn") as HTMLButtonElement;

		this.playPauseBtn.addEventListener("click", () => this.togglePlayback());
		this.pipBtn.addEventListener("click", () => this.togglePiP());
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
				this.camera.position.set(0, 20, 0);
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
		this.playbackStartTime = 0;
		this.nextNoteIndex = 0;
		this.noteVisualizer.noteObjects.position.z = 0;
		this.playPauseBtn.textContent = "Play";
		if (this.statsDisplay) {
			this.statsDisplay.style.display = "none";
		}

		this.synth.stopAllNotes();
		this.activeNotes.forEach((note) => this.piano.releaseKey(note.midi));
		this.activeNotes.clear();
		this.noteVisualizer.resetVisuals();
	}

	private togglePlayback(): void {
		if (!this.midiData) return;
		this.synth.resumeContext();
		this.isPlaying = !this.isPlaying;
		if (this.isPlaying) {
			this.playbackStartTime = this.clock.getElapsedTime() - this.elapsedTime;
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
			this.playbackStartTime = this.clock.getElapsedTime() - this.elapsedTime;
		}

		// Stop all audio and visual feedback
		this.synth.stopAllNotes();
		this.activeNotes.forEach((note) => this.piano.releaseKey(note.midi));
		this.activeNotes.clear();
		this.noteVisualizer.resetVisuals();

		// Find the next note to be played
		this.nextNoteIndex = this.notesToPlay.findIndex((playableNote) => playableNote.note.time >= this.elapsedTime);
		if (this.nextNoteIndex === -1) this.nextNoteIndex = this.notesToPlay.length;

		// Recover notes that should be active at the seek time
		for (let i = 0; i < this.notesToPlay.length; i++) {
			const { note } = this.notesToPlay[i];
			// A note is active if the seek time is between its start and end times
			if (note.time <= this.elapsedTime && note.time + note.duration > this.elapsedTime) {
				this.piano.pressKey(note.midi);
				this.activeNotes.set(note.midi, note);
			}
		}
		this.noteVisualizer.update(this.elapsedTime, this.activeNotes);
	}

	private initPiP(): void {
		// Create a canvas to draw something to show in the PiP window
		this.pipCanvas = document.createElement("canvas");
		this.pipCanvas.width = 256;
		this.pipCanvas.height = 256;
		const ctx = this.pipCanvas.getContext("2d")!;
		ctx.fillStyle = "#2c3e50";
		ctx.fillRect(0, 0, 256, 256);
		ctx.fillStyle = "white";
		ctx.font = "24px sans-serif";
		ctx.textAlign = "center";
		ctx.fillText("MIDI Visualizer", 128, 128);

		// Create a video element from the canvas stream
		// @ts-ignore
		const stream = this.pipCanvas.captureStream();
		this.pipVideo = document.createElement("video");
		this.pipVideo.srcObject = stream;
		this.pipVideo.muted = true; // Video must be muted to play in background
		this.pipVideo.play();
	}

	private async togglePiP(): Promise<void> {
		if (!document.pictureInPictureEnabled) {
			console.error("Picture-in-Picture is not supported in this browser.");
			return;
		}

		try {
			if (document.pictureInPictureElement) {
				await document.exitPictureInPicture();
			} else {
				await this.pipVideo.requestPictureInPicture();
			}
		} catch (error) {
			console.error("Error toggling Picture-in-Picture:", error);
		}
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

		this.elapsedTime = this.clock.getElapsedTime() - this.playbackStartTime;
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
			this.piano.pressKey(note.midi);
			this.activeNotes.set(note.midi, note);
			this.nextNoteIndex++;
		}

		// Notes OFF
		this.activeNotes.forEach((note, midi) => {
			if (note.time + note.duration <= this.elapsedTime) {
				// If match duration is OFF, we manually stop the note.
				// If it's ON, the synth/sampler is responsible for stopping it at the right time.
				if (!this.matchNoteDurationToggle.checked) {
					this.synth.stopNote(midi);
				}
				this.piano.releaseKey(midi);
				this.activeNotes.delete(midi);
			}
		});

		this.noteVisualizer.noteObjects.position.z = this.elapsedTime * TIME_SCALE;
		this.updateUI();
	}

	private animate(): void {
		requestAnimationFrame(this.animate.bind(this));
		this.updatePlayback();
		this.noteVisualizer.update(this.elapsedTime, this.activeNotes);
		this.renderer.render(this.scene, this.camera);
	}
}

new MidiVisualizer();
