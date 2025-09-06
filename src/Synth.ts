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
	private channelInstruments: Map<number, string> = new Map();

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

	public setInstrument(channel: number, instrument: string): void {
		this.channelInstruments.set(channel, instrument);
		if (!OSCILLATOR_TYPES.includes(instrument as OscillatorType)) {
			this.loadSampler(instrument);
		}
	}

	public playNote(note: Note, channel: number, matchDuration = true): void {
		if (this.audioContext.state === "suspended") {
			this.audioContext.resume();
		}

		const instrument = this.channelInstruments.get(channel) || "triangle";

		if (OSCILLATOR_TYPES.includes(instrument as OscillatorType)) {
			this.playOscillatorNote(note, instrument as OscillatorType, matchDuration);
		} else {
			const sampler = this.samplers.get(instrument);
			if (sampler) {
				sampler.playNote(note.midi, note.velocity, note.duration, matchDuration);
			} else {
				console.warn(`Sampler for ${instrument} not found. Playing fallback sound.`);
				this.playOscillatorNote(note, instrument as OscillatorType, matchDuration);
			}
		}
	}

	private playOscillatorNote(note: Note, instrument: OscillatorType, matchDuration: boolean): void {
		if (this.activeOscillators.has(note.midi)) {
			return;
		}

		const oscillator = this.audioContext.createOscillator();
		const gainNode = this.audioContext.createGain();

		const frequency = Math.pow(2, (note.midi - 69) / 12) * 440;
		oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
		oscillator.type = instrument;

		gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
		gainNode.gain.linearRampToValueAtTime(note.velocity, this.audioContext.currentTime + 0.05);

		oscillator.connect(gainNode);
		gainNode.connect(this.mainGain);
		oscillator.start();

		this.activeOscillators.set(note.midi, { oscillator, gainNode });

		if (matchDuration) {
			const stopTime = this.audioContext.currentTime + note.duration;
			gainNode.gain.setValueAtTime(gainNode.gain.value, stopTime - 0.1);
			gainNode.gain.linearRampToValueAtTime(0, stopTime);
			oscillator.stop(stopTime);
		}
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

		// Also stop the note if it's a sampler
		this.samplers.forEach((sampler) => {
			sampler.stopNote(midiNote);
		});
	}

	public stopAllNotes(): void {
		this.activeOscillators.forEach((_, midiNote) => {
			this.stopNote(midiNote);
		});

		this.samplers.forEach((sampler) => {
			sampler.stopAllNotes();
		});
	}

	public resumeContext(): void {
		if (this.audioContext.state === "suspended") {
			this.audioContext.resume();
		}
	}
}
