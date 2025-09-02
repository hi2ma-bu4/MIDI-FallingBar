import type { Note } from "@tonejs/midi/dist/Note";

interface ActiveNote {
	oscillator: OscillatorNode;
	gainNode: GainNode;
}

export class Synth {
	private audioContext: AudioContext;
	private activeNotes: Map<number, ActiveNote> = new Map();
	private mainGain: GainNode;

	constructor() {
		this.audioContext = new window.AudioContext();
		this.mainGain = this.audioContext.createGain();
		this.mainGain.gain.value = 0.3; // Master volume, reduced to prevent clipping
		this.mainGain.connect(this.audioContext.destination);
	}

	public playNote(note: Note, instrument: OscillatorType = "triangle"): void {
		if (this.audioContext.state === "suspended") {
			this.audioContext.resume();
		}

		// Avoid re-triggering if the note is already playing
		if (this.activeNotes.has(note.midi)) {
			return;
		}

		const oscillator = this.audioContext.createOscillator();
		const gainNode = this.audioContext.createGain();

		const frequency = Math.pow(2, (note.midi - 69) / 12) * 440;
		oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
		oscillator.type = instrument;

		// Attack based on velocity
		gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
		gainNode.gain.linearRampToValueAtTime(note.velocity, this.audioContext.currentTime + 0.05); // Attack time

		oscillator.connect(gainNode);
		gainNode.connect(this.mainGain);

		oscillator.start();

		this.activeNotes.set(note.midi, { oscillator, gainNode });
	}

	public stopNote(midiNote: number): void {
		const note = this.activeNotes.get(midiNote);
		if (note) {
			// Release
			const releaseTime = 0.3;
			note.gainNode.gain.cancelScheduledValues(this.audioContext.currentTime);
			note.gainNode.gain.setValueAtTime(note.gainNode.gain.value, this.audioContext.currentTime);
			note.gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + releaseTime);

			note.oscillator.stop(this.audioContext.currentTime + releaseTime);

			this.activeNotes.delete(midiNote);
		}
	}

	public stopAllNotes(): void {
		this.activeNotes.forEach((note, midiNote) => {
			this.stopNote(midiNote);
		});
	}

	public resumeContext(): void {
		if (this.audioContext.state === "suspended") {
			this.audioContext.resume();
		}
	}
}
