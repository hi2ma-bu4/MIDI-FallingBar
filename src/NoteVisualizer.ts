import type { Midi } from "@tonejs/midi";
import type { Note } from "@tonejs/midi/dist/Note";
import { BoxGeometry, Color, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Scene, ShaderMaterial, Vector3 } from "three";
import { BLACK_KEY_WIDTH, Piano, WHITE_KEY_HEIGHT, WHITE_KEY_WIDTH } from "./Piano";
import { TIME_SCALE } from "./constants";
import noteVertexShader from "./shaders/note.vert.glsl";
import noteFragmentShader from "./shaders/note.frag.glsl";

const NOTE_BAR_HEIGHT = 0.2;
export const ACTIVE_BRIGHTNESS = 0.5;
const PLAYED_DARKEN_FACTOR = 0.4;

// A simple color palette for different MIDI channels
export const CHANNEL_COLORS = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff, 0xffffff, 0xff8800, 0x00ff88, 0x8800ff, 0x88ff00, 0x0088ff, 0xff0088, 0x888888, 0xcc0000, 0x00cc00];

interface NoteInstance {
	mesh: InstancedMesh;
	instanceId: number;
	originalColor: Color;
	note: Note;
	channel: number;
	visible: boolean;
	state: "normal" | "active" | "finished";
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
	private notesByTime: NoteInstance[] = [];
	private tempColor = new Color(); // To avoid creating new Color objects in the loop
	private tempMatrix = new Matrix4();
	private tempPosition = new Vector3();
	private tempQuaternion = new Quaternion();
	private tempScale = new Vector3();
	private isSuperLightweight = false;

	constructor(scene: Scene, piano: Piano) {
		this.scene = scene;
		this.piano = piano;
		this.noteObjects = new Group();
		this.scene.add(this.noteObjects);
	}

	public visualize(midi: Midi, performanceMode: "normal" | "lightweight" | "super-lightweight"): void {
		this.clear();
		this.isSuperLightweight = performanceMode === "super-lightweight";

		const notesByChannel = new Map<number, Note[]>();
		midi.tracks.forEach((track) => {
			if (track.channel === 9) return;
			track.notes.forEach((note) => {
				if (!notesByChannel.has(track.channel)) {
					notesByChannel.set(track.channel, []);
				}
				notesByChannel.get(track.channel)?.push(note);
			});
		});

		notesByChannel.forEach((notes, channel) => {
			const baseColor = new Color(CHANNEL_COLORS[channel % CHANNEL_COLORS.length]);

			const geometry = new BoxGeometry(1, NOTE_BAR_HEIGHT, 1);
			let material;

			if (this.isSuperLightweight) {
				material = new ShaderMaterial({
					uniforms: {
						uElapsedTime: { value: 0.0 },
					},
					vertexShader: noteVertexShader,
					fragmentShader: noteFragmentShader,
					transparent: true,
				});

				const noteData = new Float32Array(notes.length * 2);
				const originalColors = new Float32Array(notes.length * 3);

				notes.forEach((note, i) => {
					noteData[i * 2] = note.time;
					noteData[i * 2 + 1] = note.duration;
					baseColor.toArray(originalColors, i * 3);
				});

				geometry.setAttribute("aNoteData", new InstancedBufferAttribute(noteData, 2));
				geometry.setAttribute("aOriginalColor", new InstancedBufferAttribute(originalColors, 3));
			} else {
				material = new MeshStandardMaterial({
					color: baseColor,
					roughness: 0.5,
					transparent: true,
					opacity: 0.9,
				});
			}

			const instancedMesh = new InstancedMesh(geometry, material, notes.length);
			instancedMesh.name = `channel_${channel}`;

			notes.forEach((note, index) => {
				const { midi, time, duration } = note;
				const key = this.piano.getKey(midi);
				if (!key) return;

				const keyPosition = key.position;
				const keyWidth = this.piano.isBlackKey(midi) ? BLACK_KEY_WIDTH : WHITE_KEY_WIDTH;

				const yOffset = channel * 0.001; // To prevent z-fighting
				const keyTopY = WHITE_KEY_HEIGHT / 2;
				const barY = keyTopY - NOTE_BAR_HEIGHT / 2 - 0.01; // Place bar slightly below key top

				this.tempPosition.set(keyPosition.x, barY + yOffset, -time * TIME_SCALE - (duration * TIME_SCALE) / 2);
				this.tempScale.set(keyWidth * 0.9, 1, duration * TIME_SCALE);
				this.tempQuaternion.identity();

				this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
				instancedMesh.setMatrixAt(index, this.tempMatrix);

				const originalColor = baseColor.clone();
				if (!this.isSuperLightweight) {
					instancedMesh.setColorAt(index, originalColor);
				}

				const noteKey = `${note.midi}-${note.time}-${channel}`;
				const noteInstance: NoteInstance = {
					mesh: instancedMesh,
					instanceId: index,
					originalColor,
					note,
					channel: channel,
					visible: true,
					state: "normal",
				};
				this.noteMap.set(noteKey, noteInstance);
			});

			if (instancedMesh.instanceColor && !this.isSuperLightweight) {
				instancedMesh.instanceColor.needsUpdate = true;
			}
			this.noteObjects.add(instancedMesh);
		});

		this.notesByTime = Array.from(this.noteMap.values()).sort((a, b) => a.note.time - b.note.time);
	}

	public update(elapsedTime: number, activeNotes: Map<string, PlayableNote>): void {
		if (this.isSuperLightweight) {
			this.noteObjects.children.forEach((mesh) => {
				if (mesh instanceof InstancedMesh && mesh.material instanceof ShaderMaterial) {
					mesh.material.uniforms.uElapsedTime.value = elapsedTime;
				}
			});
			return;
		}

		if (this.notesByTime.length === 0) return;

		const activeNoteKeys = new Set(activeNotes.keys());
		const visibleStartTime = elapsedTime - 5;
		const visibleEndTime = elapsedTime + 15;
		const meshesToUpdate = new Set<InstancedMesh>();

		// More efficient culling by finding a start and end index
		let startIndex = this.notesByTime.findIndex((n) => n.note.time + n.note.duration >= visibleStartTime);
		if (startIndex === -1) startIndex = this.notesByTime.length; // All notes are before the visible range

		let endIndex = this.notesByTime.findIndex((n) => n.note.time > visibleEndTime);
		if (endIndex === -1) endIndex = this.notesByTime.length; // All notes are within the visible range

		// Hide notes before the visible range
		for (let i = 0; i < startIndex; i++) {
			const instance = this.notesByTime[i];
			if (instance.visible) {
				instance.visible = false;
				this.hideInstance(instance);
				meshesToUpdate.add(instance.mesh);
			}
		}

		// Process visible notes
		for (let i = startIndex; i < endIndex; i++) {
			const instance = this.notesByTime[i];
			const { mesh, instanceId, originalColor, note, channel } = instance;

			if (!instance.visible) {
				instance.visible = true;
				this.showInstance(instance);
				meshesToUpdate.add(instance.mesh);
			}

			const noteKey = `${note.midi}-${note.time}-${channel}`;
			const isFinished = note.time + note.duration < elapsedTime;
			const isActive = activeNoteKeys.has(noteKey);
			let newState: "normal" | "active" | "finished" = isActive ? "active" : isFinished ? "finished" : "normal";

			if (instance.state !== newState) {
				instance.state = newState;
				const targetColor = this.tempColor;
				if (newState === "active") {
					targetColor.copy(originalColor).addScalar(ACTIVE_BRIGHTNESS);
				} else if (newState === "finished") {
					targetColor.copy(originalColor).multiplyScalar(PLAYED_DARKEN_FACTOR);
				} else {
					targetColor.copy(originalColor);
				}
				mesh.setColorAt(instanceId, targetColor);
				if (mesh.instanceColor) {
					mesh.instanceColor.needsUpdate = true;
				}
			}
		}

		// Hide notes after the visible range
		for (let i = endIndex; i < this.notesByTime.length; i++) {
			const instance = this.notesByTime[i];
			if (instance.visible) {
				instance.visible = false;
				this.hideInstance(instance);
				meshesToUpdate.add(instance.mesh);
			}
		}

		meshesToUpdate.forEach((mesh) => {
			mesh.instanceMatrix.needsUpdate = true;
		});
	}

	private hideInstance(instance: NoteInstance): void {
		instance.mesh.getMatrixAt(instance.instanceId, this.tempMatrix);
		this.tempMatrix.decompose(this.tempPosition, this.tempQuaternion, this.tempScale);
		this.tempScale.set(0, 0, 0);
		this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
		instance.mesh.setMatrixAt(instance.instanceId, this.tempMatrix);
	}

	private showInstance(instance: NoteInstance): void {
		const { note, channel, instanceId, mesh } = instance;
		const key = this.piano.getKey(note.midi);
		if (!key) return;

		const keyPosition = key.position;
		const keyWidth = this.piano.isBlackKey(note.midi) ? BLACK_KEY_WIDTH : WHITE_KEY_WIDTH;
		const yOffset = channel * 0.001;
		const keyTopY = WHITE_KEY_HEIGHT / 2;
		const barY = keyTopY - NOTE_BAR_HEIGHT / 2 - 0.01;
		this.tempPosition.set(keyPosition.x, barY + yOffset, -note.time * TIME_SCALE - (note.duration * TIME_SCALE) / 2);
		this.tempScale.set(keyWidth * 0.9, 1, note.duration * TIME_SCALE);
		this.tempQuaternion.identity();
		this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
		mesh.setMatrixAt(instanceId, this.tempMatrix);
	}

	public resetVisuals(): void {
		if (this.isSuperLightweight) return;
		this.notesByTime.forEach((instance) => {
			instance.state = "normal";
			const { mesh, instanceId, originalColor } = instance;
			mesh.setColorAt(instanceId, originalColor);
			if (mesh.instanceColor) {
				mesh.instanceColor.needsUpdate = true;
			}
		});
	}

	public clear(): void {
		this.noteObjects.children.forEach((child) => {
			if (child instanceof InstancedMesh) {
				child.geometry.dispose();
				if (Array.isArray(child.material)) {
					child.material.forEach((m) => m.dispose());
				} else {
					child.material.dispose();
				}
			}
		});
		this.noteObjects.clear();
		this.noteMap.clear();
		this.notesByTime = [];
	}

	public setChannelOpacity(channel: number, opacity: number): void {
		const meshName = `channel_${channel}`;
		const mesh = this.noteObjects.getObjectByName(meshName) as InstancedMesh;
		if (mesh) {
			if (mesh.material instanceof MeshStandardMaterial) {
				mesh.material.opacity = opacity;
			} else if (mesh.material instanceof ShaderMaterial) {
				// Note: This requires the shader to handle opacity.
				// The current fragment shader has a hardcoded opacity.
				// For simplicity, we'll leave it, but a more robust solution
				// would involve passing opacity as a uniform.
			}
		}
	}
}
