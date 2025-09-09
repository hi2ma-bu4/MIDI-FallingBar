import type { Midi } from "@tonejs/midi";
import type { Note } from "@tonejs/midi/dist/Note";
import {
	BoxGeometry,
	Color,
	Group,
	InstancedBufferAttribute,
	InstancedMesh,
	Matrix4,
	Quaternion,
	Scene,
	ShaderMaterial,
	Uniform,
	Vector3,
} from "three";
import { BLACK_KEY_WIDTH, Piano, WHITE_KEY_HEIGHT, WHITE_KEY_WIDTH } from "./Piano";
import { TIME_SCALE } from "./constants";
// @ts-ignore
import fragmentShader from "./shaders/note.frag";
// @ts-ignore
import vertexShader from "./shaders/note.vert";

export const ACTIVE_BRIGHTNESS = 0.5;

export const CHANNEL_COLORS = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff, 0xffffff, 0xff8800, 0x00ff88, 0x8800ff, 0x88ff00, 0x0088ff, 0xff0088, 0x888888, 0xcc0000, 0x00cc00];

interface NoteInstance {
	note: Note;
	channel: number;
	instanceId: number;
	originalColor: Color;
}

interface PlayableNote {
	note: Note;
	channel: number;
}

export class NoteVisualizer {
	private scene: Scene;
	private piano: Piano;
	public noteObjects: Group;
	private noteMap: Map<string, NoteInstance> = new Map();
	private instancedMesh: InstancedMesh | null = null;
	private material: ShaderMaterial;
	private lastActiveNotes: Set<string> = new Set();

	private tempColor = new Color();

	constructor(scene: Scene, piano: Piano) {
		this.scene = scene;
		this.piano = piano;
		this.noteObjects = new Group();
		this.material = new ShaderMaterial({
			vertexShader,
			fragmentShader,
			uniforms: {
				elapsedTime: new Uniform(0),
				channelOpacities: new Uniform(new Array(16).fill(0.9)),
			},
			transparent: true,
		});
		this.scene.add(this.noteObjects);
	}

	public visualize(midi: Midi): void {
		this.clear();

		const allNotes: NoteInstance[] = [];
		midi.tracks.forEach((track) => {
			if (track.channel === 9) return; // Ignore percussion
			track.notes.forEach((note) => {
				const noteKey = `${note.midi}-${note.time}-${track.channel}`;
				const originalColor = new Color(CHANNEL_COLORS[track.channel % CHANNEL_COLORS.length]);
				const instance = {
					note,
					channel: track.channel,
					instanceId: 0, // Will be set later
					originalColor,
				};
				allNotes.push(instance);
				this.noteMap.set(noteKey, instance);
			});
		});

		if (allNotes.length === 0) return;

		// Sort by time to enable efficient culling later
		allNotes.sort((a, b) => a.note.time - b.note.time);
		allNotes.forEach((instance, i) => (instance.instanceId = i));

		// Reset material uniforms for the new song
		this.material.uniforms.elapsedTime.value = 0;
		this.material.uniforms.channelOpacities.value.fill(0.9);

		const geometry = new BoxGeometry(1, 0.2, 1); // Use a standard size, scale in instance matrix
		this.instancedMesh = new InstancedMesh(geometry, this.material, allNotes.length);

		const instanceColor = new InstancedBufferAttribute(new Float32Array(allNotes.length * 3), 3);
		const instanceNoteTime = new InstancedBufferAttribute(new Float32Array(allNotes.length), 1);
		const instanceNoteDuration = new InstancedBufferAttribute(new Float32Array(allNotes.length), 1);
		const instanceChannel = new InstancedBufferAttribute(new Float32Array(allNotes.length), 1);
		const tempMatrix = new Matrix4();
		const tempPosition = new Vector3();
		const tempQuaternion = new Quaternion();
		const tempScale = new Vector3();

		allNotes.forEach((instance, i) => {
			const { note, channel, originalColor } = instance;
			const { midi, time, duration } = note;
			const key = this.piano.getKey(midi);
			if (!key) return;

			const keyPosition = key.position;
			const keyWidth = this.piano.isBlackKey(midi) ? BLACK_KEY_WIDTH : WHITE_KEY_WIDTH;
			const yOffset = channel * 0.001; // Prevent z-fighting
			const keyTopY = WHITE_KEY_HEIGHT / 2;
			const barY = keyTopY - 0.2 / 2 - 0.01;

			tempPosition.set(keyPosition.x, barY + yOffset, -time * TIME_SCALE - (duration * TIME_SCALE) / 2);
			tempScale.set(keyWidth * 0.9, 1, duration * TIME_SCALE);
			tempQuaternion.identity();
			tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
			this.instancedMesh!.setMatrixAt(i, tempMatrix);

			originalColor.toArray(instanceColor.array as Float32Array, i * 3);
			instanceNoteTime.setX(i, time);
			instanceNoteDuration.setX(i, duration);
			instanceChannel.setX(i, channel);
		});

		this.instancedMesh.geometry.setAttribute("instanceColor", instanceColor);
		this.instancedMesh.geometry.setAttribute("instanceNoteTime", instanceNoteTime);
		this.instancedMesh.geometry.setAttribute("instanceNoteDuration", instanceNoteDuration);
		this.instancedMesh.geometry.setAttribute("instanceChannel", instanceChannel);

		this.instancedMesh.instanceMatrix.needsUpdate = true;
		this.noteObjects.add(this.instancedMesh);
	}

	public update(elapsedTime: number, activeNotes: Map<string, PlayableNote>): void {
		if (!this.instancedMesh || !this.material) return;

		// Update shader uniform
		this.material.uniforms.elapsedTime.value = elapsedTime;

		const instanceColor = this.instancedMesh.geometry.getAttribute("instanceColor") as InstancedBufferAttribute;
		let colorsNeedUpdate = false;

		const currentActiveKeys = new Set(activeNotes.keys());

		// Revert colors for notes that are no longer active
		this.lastActiveNotes.forEach((noteKey) => {
			if (!currentActiveKeys.has(noteKey)) {
				const instance = this.noteMap.get(noteKey);
				if (instance) {
					instance.originalColor.toArray(instanceColor.array as Float32Array, instance.instanceId * 3);
					colorsNeedUpdate = true;
				}
			}
		});

		// Set bright colors for currently active notes
		currentActiveKeys.forEach((noteKey) => {
			if (!this.lastActiveNotes.has(noteKey)) {
				const instance = this.noteMap.get(noteKey);
				if (instance) {
					this.tempColor.copy(instance.originalColor).addScalar(ACTIVE_BRIGHTNESS);
					this.tempColor.toArray(instanceColor.array as Float32Array, instance.instanceId * 3);
					colorsNeedUpdate = true;
				}
			}
		});

		if (colorsNeedUpdate) {
			instanceColor.needsUpdate = true;
		}

		// Update the set of active notes for the next frame
		this.lastActiveNotes = currentActiveKeys;
	}

	public resetVisuals(): void {
		if (!this.instancedMesh) return;
		const instanceColor = this.instancedMesh.geometry.getAttribute("instanceColor") as InstancedBufferAttribute;
		this.noteMap.forEach((instance) => {
			instance.originalColor.toArray(instanceColor.array as Float32Array, instance.instanceId * 3);
		});
		instanceColor.needsUpdate = true;
		this.lastActiveNotes.clear();
	}

	public clear(): void {
		if (this.instancedMesh) {
			this.instancedMesh.geometry.dispose();
			// Do not dispose the material, as it is reused
			this.noteObjects.remove(this.instancedMesh);
		}
		this.noteMap.clear();
		this.instancedMesh = null;
	}

	public setChannelOpacity(channel: number, opacity: number): void {
		if (this.material) {
			this.material.uniforms.channelOpacities.value[channel] = opacity;
		}
	}

	public setAllChannelOpacities(opacities: number[]): void {
		if (this.material) {
			this.material.uniforms.channelOpacities.value = opacities;
		}
	}
}
