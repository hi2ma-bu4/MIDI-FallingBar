import { Midi } from "@tonejs/midi";
import type { Note } from "@tonejs/midi/dist/Note";
import { AmbientLight, Clock, Color, DirectionalLight, PerspectiveCamera, Scene, WebGLRenderer } from "three";
import { NoteVisualizer } from "./NoteVisualizer";
import { Piano } from "./Piano";
import { Synth } from "./Synth";
import { TIME_SCALE } from "./constants";
import "./style.css";

// A simple mapping from MIDI program numbers to oscillator types
const programToInstrument = (program: number): OscillatorType => {
	// Piano
	if (program >= 0 && program <= 7) return "triangle";
	// Chromatic Percussion
	if (program >= 8 && program <= 15) return "sine";
	// Organ
	if (program >= 16 && program <= 23) return "sine";
	// Guitar
	if (program >= 24 && program <= 31) return "sine";
	// Bass
	if (program >= 32 && program <= 39) return "sawtooth";
	// Strings
	if (program >= 40 && program <= 47) return "square";
	// Ensemble
	if (program >= 48 && program <= 55) return "square";
	// Brass
	if (program >= 56 && program <= 63) return "sawtooth";
	// Reed
	if (program >= 64 && program <= 71) return "sawtooth";
	// Pipe
	if (program >= 72 && program <= 79) return "sine";
	// Synth Lead
	if (program >= 80 && program <= 87) return "sawtooth";
	// Synth Pad
	if (program >= 88 && program <= 95) return "square";

	return "triangle"; // Default
};

interface PlayableNote {
	note: Note;
	instrument: OscillatorType;
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

		this.playPauseBtn.addEventListener("click", () => this.togglePlayback());
		this.progressBar.addEventListener("click", (e) => this.handleSeek(e));

		window.addEventListener("resize", this.onWindowResize.bind(this), false);

		const fileInput = document.getElementById("midi-file") as HTMLInputElement;
		fileInput.addEventListener("change", (event) => this.handleMidiFile(event));

		this.initDragAndDrop();
		this.initZoom();
	}

	private initZoom(): void {
		const container = document.getElementById("webgl-container")!;
		container.addEventListener("wheel", (event) => {
			event.preventDefault();
			const zoomSpeed = 0.01;
			this.camera.position.z += event.deltaY * zoomSpeed;

			// Clamp zoom
			this.camera.position.z = Math.max(5, Math.min(this.camera.position.z, 50));
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

	private async loadMidi(arrayBuffer: ArrayBuffer): Promise<void> {
		try {
			this.midiData = new Midi(arrayBuffer);
			this.noteVisualizer.visualize(this.midiData);

			this.notesToPlay = this.midiData.tracks
				.flatMap((track) => {
					// For each track, map its notes to a PlayableNote object
					const instrument = programToInstrument(track.instrument.number);
					// Ignore percussion track for now
					if (track.channel === 9) return [];
					return track.notes.map((note) => ({ note, instrument }));
				})
				.sort((a, b) => a.note.time - b.note.time);

			this.resetPlayback();
			this.uiContainer.style.display = "flex";
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

		this.synth.stopAllNotes();
		this.activeNotes.forEach((note) => this.piano.releaseKey(note.midi));
		this.activeNotes.clear();
	}

	private togglePlayback(): void {
		if (!this.midiData) return;
		this.synth.resumeContext();
		this.isPlaying = !this.isPlaying;
		if (this.isPlaying) {
			this.playbackStartTime = this.clock.getElapsedTime() - this.elapsedTime;
			this.playPauseBtn.textContent = "Pause";
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

		// Find the next note to be played
		this.nextNoteIndex = this.notesToPlay.findIndex((playableNote) => playableNote.note.time >= this.elapsedTime);
		if (this.nextNoteIndex === -1) this.nextNoteIndex = this.notesToPlay.length;

		// Recover notes that should be active at the seek time
		for (let i = 0; i < this.nextNoteIndex; i++) {
			const { note } = this.notesToPlay[i];
			if (note.time + note.duration > this.elapsedTime) {
				this.piano.pressKey(note.midi);
				this.activeNotes.set(note.midi, note);
			}
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
			const { note, instrument } = this.notesToPlay[this.nextNoteIndex];
			this.synth.playNote(note, instrument);
			this.piano.pressKey(note.midi);
			this.activeNotes.set(note.midi, note);
			this.nextNoteIndex++;
		}

		// Notes OFF
		this.activeNotes.forEach((note, midi) => {
			if (note.time + note.duration <= this.elapsedTime) {
				this.synth.stopNote(midi);
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
		this.renderer.render(this.scene, this.camera);
	}
}

new MidiVisualizer();
