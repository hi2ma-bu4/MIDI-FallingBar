export class Sampler {
	private audioContext: AudioContext;
	private samples: Map<string, AudioBuffer> = new Map();
	private instrument: string;
	private baseUrl = "https://raw.githubusercontent.com/nbrosowsky/tonejs-instruments/master/samples/";

	constructor(audioContext: AudioContext, instrument: string) {
		this.audioContext = audioContext;
		this.instrument = instrument;
	}

	public async load(): Promise<void> {
		// For now, let's just load a few piano notes to test
		const notesToLoad = ["C4", "G4", "C5"];
		const promises = notesToLoad.map(async (note) => {
			const url = `${this.baseUrl}${this.instrument}/${note}.mp3`;
			try {
				const response = await fetch(url);
				if (!response.ok) {
					throw new Error(`Failed to fetch sample: ${url}`);
				}
				const arrayBuffer = await response.arrayBuffer();
				const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
				this.samples.set(note, audioBuffer);
			} catch (error) {
				console.error(`Could not load sample ${note} for ${this.instrument}`, error);
			}
		});
		await Promise.all(promises);
	}

	public playNote(midi: number, velocity: number): void {
		if (this.samples.size === 0) {
			console.warn(`No samples loaded for ${this.instrument}, cannot play note.`);
			return;
		}

		// Find the closest sample
		const noteName = this.midiToNoteName(midi);
		const fundamental = noteName.substring(0, noteName.length - 1);
		let closestSampleName = "";
		let minDistance = Infinity;

		// A very simple way to find the closest sample - assumes samples are named like "C4"
		// A better implementation would parse the note names properly.
		const availableNotes = Array.from(this.samples.keys());
		availableNotes.forEach((sampleNote) => {
			const sampleMidi = this.noteNameToMidi(sampleNote);
			const distance = Math.abs(midi - sampleMidi);
			if (distance < minDistance) {
				minDistance = distance;
				closestSampleName = sampleNote;
			}
		});

		const sampleBuffer = this.samples.get(closestSampleName);
		if (!sampleBuffer) return;

		const source = this.audioContext.createBufferSource();
		source.buffer = sampleBuffer;

		// Pitch shift
		const closestMidi = this.noteNameToMidi(closestSampleName);
		const detune = (midi - closestMidi) * 100;
		source.detune.value = detune;

		// Volume
		const gainNode = this.audioContext.createGain();
		gainNode.gain.setValueAtTime(velocity, this.audioContext.currentTime);
		gainNode.connect(this.audioContext.destination);

		source.connect(gainNode);
		source.start();
	}

	// Helper to convert MIDI number to note name (e.g., 60 -> C4)
	private midiToNoteName(midi: number): string {
		const octave = Math.floor(midi / 12) - 1;
		const noteIndex = midi % 12;
		const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
		return `${noteNames[noteIndex]}${octave}`;
	}

	// Helper to convert note name to MIDI number (e.g., C4 -> 60)
	private noteNameToMidi(name: string): number {
		const noteNames = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
		const octave = parseInt(name.slice(-1));
		const note = name.slice(0, -1);
		// @ts-ignore
		return noteNames[note] + (octave + 1) * 12;
	}
}
