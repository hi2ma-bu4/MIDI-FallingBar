import type { Note } from "@tonejs/midi/dist/Note";
import { Sampler } from "./Sampler";

interface ActiveOscillator {
	oscillator: OscillatorNode;
	gainNode: GainNode;
}

const OSCILLATOR_TYPES: OscillatorType[] = ["sine", "square", "sawtooth", "triangle"];

export class Synth {
	private audioContext: AudioContext;
	private activeOscillators: Map<number, ActiveOscillator> = new Map();
	private mainGain: GainNode;

	private samplers: Map<string, Sampler> = new Map();
	private activeInstrument = "triangle"; // Default instrument

	constructor() {
		this.audioContext = new window.AudioContext();
		this.mainGain = this.audioContext.createGain();
		this.mainGain.gain.value = 0.3;
		this.mainGain.connect(this.audioContext.destination);

		// Pre-load piano sampler
		this.loadSampler("piano");
	}

	private async loadSampler(instrument: string): Promise<void> {
		if (this.samplers.has(instrument)) {
			return;
		}
		console.log(`Loading ${instrument}...`);
		const sampler = new Sampler(this.audioContext, instrument);
		this.samplers.set(instrument, sampler);
		await sampler.load();
		console.log(`${instrument} loaded.`);
	}

	public setInstrument(instrument: string): void {
		this.activeInstrument = instrument;
		if (!OSCILLATOR_TYPES.includes(instrument as OscillatorType)) {
			this.loadSampler(instrument);
		}
	}

	public playNote(note: Note): void {
		if (this.audioContext.state === "suspended") {
			this.audioContext.resume();
		}

		if (OSCILLATOR_TYPES.includes(this.activeInstrument as OscillatorType)) {
			this.playOscillatorNote(note);
		} else {
			const sampler = this.samplers.get(this.activeInstrument);
			if (sampler) {
				sampler.playNote(note.midi, note.velocity);
			} else {
				console.warn(`Sampler for ${this.activeInstrument} not found. Playing fallback sound.`);
				this.playOscillatorNote(note);
			}
		}
	}

	private playOscillatorNote(note: Note): void {
		if (this.activeOscillators.has(note.midi)) {
			return;
		}

		const oscillator = this.audioContext.createOscillator();
		const gainNode = this.audioContext.createGain();

		const frequency = Math.pow(2, (note.midi - 69) / 12) * 440;
		oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
		oscillator.type = this.activeInstrument as OscillatorType;

		gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
		gainNode.gain.linearRampToValueAtTime(note.velocity, this.audioContext.currentTime + 0.05);

		oscillator.connect(gainNode);
		gainNode.connect(this.mainGain);
		oscillator.start();

		this.activeOscillators.set(note.midi, { oscillator, gainNode });
	}

	public stopNote(midiNote: number): void {
		const activeOsc = this.activeOscillators.get(midiNote);
		if (activeOsc) {
			const releaseTime = 0.3;
			activeOsc.gainNode.gain.cancelScheduledValues(this.audioContext.currentTime);
			activeOsc.gainNode.gain.setValueAtTime(activeOsc.gainNode.gain.value, this.audioContext.currentTime);
			activeOsc.gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + releaseTime);
			activeOsc.oscillator.stop(this.audioContext.currentTime + releaseTime);
			this.activeOscillators.delete(midiNote);
		}
		// Note: stopNote for samplers is not implemented, as samples will play out.
	}

	public stopAllNotes(): void {
		this.activeOscillators.forEach((_, midiNote) => {
			this.stopNote(midiNote);
		});
		// No need to stop samplers explicitly for now
	}

	public resumeContext(): void {
		if (this.audioContext.state === "suspended") {
			this.audioContext.resume();
		}
	}
}
