import type { Midi } from "@tonejs/midi";
import type { Note } from "@tonejs/midi/dist/Note";
import { BoxGeometry, Color, Group, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Scene, Vector3 } from "three";
import { BLACK_KEY_WIDTH, Piano, WHITE_KEY_HEIGHT, WHITE_KEY_WIDTH } from "./Piano";
import { TIME_SCALE } from "./constants";

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

	constructor(scene: Scene, piano: Piano) {
		this.scene = scene;
		this.piano = piano;
		this.noteObjects = new Group();
		this.scene.add(this.noteObjects);
	}

	public visualize(midi: Midi): void {
		this.clear();

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
			const material = new MeshStandardMaterial({
				color: baseColor,
				roughness: 0.5,
				transparent: true,
				opacity: 0.9,
			});

			const geometry = new BoxGeometry(1, NOTE_BAR_HEIGHT, 1);
			const instancedMesh = new InstancedMesh(geometry, material, notes.length);
			instancedMesh.name = `channel_${channel}`;

			notes.forEach((note, index) => {
				const { midi, time, duration } = note;
				const key = this.piano.getKey(midi);
				if (!key) return;

				const keyPosition = key.position.clone();
				const keyWidth = this.piano.isBlackKey(midi) ? BLACK_KEY_WIDTH : WHITE_KEY_WIDTH;

				const matrix = new Matrix4();
				const yOffset = channel * 0.001; // To prevent z-fighting
				// Use the white key height as a reference for all notes to keep them on the same plane
				const keyTopY = WHITE_KEY_HEIGHT / 2;
				const barY = keyTopY - NOTE_BAR_HEIGHT / 2 - 0.01; // Place bar slightly below key top

				const position = new Vector3(keyPosition.x, barY + yOffset, -time * TIME_SCALE - (duration * TIME_SCALE) / 2);
				const scale = new Vector3(keyWidth * 0.9, 1, duration * TIME_SCALE);
				const quaternion = new Quaternion();

				matrix.compose(position, quaternion, scale);
				instancedMesh.setMatrixAt(index, matrix);

				// Store instance info for updates
				const noteKey = `${note.midi}-${note.time}-${channel}`;
				const originalColor = baseColor.clone();
				instancedMesh.setColorAt(index, originalColor);

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

			if (instancedMesh.instanceColor) {
				instancedMesh.instanceColor.needsUpdate = true;
			}
			this.noteObjects.add(instancedMesh);
		});

		// Create a sorted list for efficient iteration in `update`
		this.notesByTime = Array.from(this.noteMap.values()).sort((a, b) => a.note.time - b.note.time);
	}

	public update(elapsedTime: number, activeNotes: Map<string, PlayableNote>, isSuperLightweight = false): void {
		if (this.notesByTime.length === 0) return;

		const activeNoteKeys = new Set(activeNotes.keys());

		const visibleStartTime = elapsedTime - 5;
		const visibleEndTime = elapsedTime + 15;

		const meshesToUpdate = new Set<InstancedMesh>();

		// Find the starting index for iteration
		let startIndex = 0;
		for (let i = 0; i < this.notesByTime.length; i++) {
			const note = this.notesByTime[i].note;
			if (note.time + note.duration >= visibleStartTime) {
				startIndex = i;
				break;
			}
			// Hide notes that are far in the past
			const instance = this.notesByTime[i];
			if (instance.visible) {
				instance.visible = false;
				const matrix = new Matrix4();
				instance.mesh.getMatrixAt(instance.instanceId, matrix);
				const position = new Vector3();
				const quaternion = new Quaternion();
				matrix.decompose(position, quaternion, new Vector3());
				matrix.compose(position, quaternion, new Vector3(0, 0, 0));
				instance.mesh.setMatrixAt(instance.instanceId, matrix);
				meshesToUpdate.add(instance.mesh);
			}
		}

		for (let i = startIndex; i < this.notesByTime.length; i++) {
			const instance = this.notesByTime[i];
			const { mesh, instanceId, originalColor, note, channel } = instance;

			if (note.time > visibleEndTime) {
				if (instance.visible) {
					instance.visible = false;
					const matrix = new Matrix4();
					mesh.getMatrixAt(instanceId, matrix);
					const position = new Vector3();
					const quaternion = new Quaternion();
					matrix.decompose(position, quaternion, new Vector3());
					matrix.compose(position, quaternion, new Vector3(0, 0, 0));
					mesh.setMatrixAt(instanceId, matrix);
					meshesToUpdate.add(mesh);
				}
				continue;
			}

			if (!instance.visible) {
				instance.visible = true;
				const key = this.piano.getKey(note.midi);
				if (key) {
					const keyPosition = key.position.clone();
					const keyWidth = this.piano.isBlackKey(note.midi) ? BLACK_KEY_WIDTH : WHITE_KEY_WIDTH;
					const yOffset = channel * 0.001;
					// Use the white key height as a reference for all notes to keep them on the same plane
					const keyTopY = WHITE_KEY_HEIGHT / 2;
					const barY = keyTopY - NOTE_BAR_HEIGHT / 2 - 0.01; // Place bar slightly below key top
					const position = new Vector3(keyPosition.x, barY + yOffset, -note.time * TIME_SCALE - (note.duration * TIME_SCALE) / 2);
					const scale = new Vector3(keyWidth * 0.9, 1, note.duration * TIME_SCALE);
					const quaternion = new Quaternion();
					const matrix = new Matrix4();
					matrix.compose(position, quaternion, scale);
					mesh.setMatrixAt(instanceId, matrix);
					meshesToUpdate.add(mesh);
				}
			}

			if (isSuperLightweight) {
				continue;
			}

			const noteKey = `${note.midi}-${note.time}-${channel}`;
			const isFinished = note.time + note.duration < elapsedTime;
			const isActive = activeNoteKeys.has(noteKey);

			let newState: "normal" | "active" | "finished" = "normal";
			if (isActive) {
				newState = "active";
			} else if (isFinished) {
				newState = "finished";
			}

			if (instance.state !== newState) {
				instance.state = newState;

				const targetColor = this.tempColor; // Use the temp color to avoid allocations
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

		meshesToUpdate.forEach((mesh) => {
			mesh.instanceMatrix.needsUpdate = true;
		});
	}

	public resetVisuals(): void {
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
				child.dispose();
			}
		});
		this.noteObjects.clear();
		this.noteMap.clear();
		this.notesByTime = [];
	}

	public setChannelOpacity(channel: number, opacity: number): void {
		const meshName = `channel_${channel}`;
		const mesh = this.noteObjects.getObjectByName(meshName) as InstancedMesh;
		if (mesh && mesh.material instanceof MeshStandardMaterial) {
			mesh.material.opacity = opacity;
		}
	}
}
