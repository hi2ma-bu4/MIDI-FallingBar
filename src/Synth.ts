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
		this.mainGain.gain.value = 0.5; // Master volume
		this.mainGain.connect(this.audioContext.destination);
	}

	public playNote(midiNote: number): void {
		if (this.audioContext.state === "suspended") {
			this.audioContext.resume();
		}

		// Avoid re-triggering if the note is already playing
		if (this.activeNotes.has(midiNote)) {
			return;
		}

		const oscillator = this.audioContext.createOscillator();
		const gainNode = this.audioContext.createGain();

		const frequency = Math.pow(2, (midiNote - 69) / 12) * 440;
		oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
		oscillator.type = "triangle";

		// Attack
		gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
		gainNode.gain.linearRampToValueAtTime(1, this.audioContext.currentTime + 0.05); // Attack time

		oscillator.connect(gainNode);
		gainNode.connect(this.mainGain);

		oscillator.start();

		this.activeNotes.set(midiNote, { oscillator, gainNode });
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
