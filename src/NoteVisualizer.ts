import type { Midi } from "@tonejs/midi";
import type { Note } from "@tonejs/midi/dist/Note";
import { BoxGeometry, Color, Group, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Scene, Vector3 } from "three";
import { BLACK_KEY_WIDTH, Piano, WHITE_KEY_WIDTH } from "./Piano";
import { TIME_SCALE } from "./constants";

const NOTE_BAR_HEIGHT = 0.2;
const ACTIVE_BRIGHTNESS = 0.5;
const PLAYED_DARKEN_FACTOR = 0.4;

// A simple color palette for different MIDI channels
const CHANNEL_COLORS = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff, 0xffffff, 0xff8800, 0x00ff88, 0x8800ff, 0x88ff00, 0x0088ff, 0xff0088, 0x888888, 0xcc0000, 0x00cc00];

interface NoteInstance {
	mesh: InstancedMesh;
	instanceId: number;
	originalColor: Color;
	note: Note;
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
				const yOffset = channel * 0.001;
				const position = new Vector3(keyPosition.x, keyPosition.y + NOTE_BAR_HEIGHT / 2 + 0.1 + yOffset, -time * TIME_SCALE - (duration * TIME_SCALE) / 2);
				const scale = new Vector3(keyWidth * 0.9, 1, duration * TIME_SCALE);
				const quaternion = new Quaternion();

				matrix.compose(position, quaternion, scale);
				instancedMesh.setMatrixAt(index, matrix);

				// Store instance info for updates
				const noteKey = `${note.midi}-${note.time}`;
				const originalColor = baseColor.clone();
				instancedMesh.setColorAt(index, originalColor);

				const noteInstance: NoteInstance = {
					mesh: instancedMesh,
					instanceId: index,
					originalColor,
					note,
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

	public update(elapsedTime: number, activeNotes: Map<number, Note>): void {
		if (this.notesByTime.length === 0) return;

		const activeNoteKeys = new Set<string>();
		activeNotes.forEach((note) => {
			activeNoteKeys.add(`${note.midi}-${note.time}`);
		});

		this.notesByTime.forEach((instance) => {
			const { mesh, instanceId, originalColor, note } = instance;
			const noteKey = `${note.midi}-${note.time}`;
			const isFinished = note.time + note.duration < elapsedTime;
			const isActive = activeNoteKeys.has(noteKey);

			mesh.getColorAt(instanceId, this.tempColor);
			const targetColor = this.tempColor.clone(); // Start with current color

			if (isActive) {
				targetColor.copy(originalColor).addScalar(ACTIVE_BRIGHTNESS);
			} else if (isFinished) {
				targetColor.copy(originalColor).multiplyScalar(PLAYED_DARKEN_FACTOR);
			} else {
				targetColor.copy(originalColor);
			}

			if (!this.tempColor.equals(targetColor)) {
				mesh.setColorAt(instanceId, targetColor);
				if (mesh.instanceColor) {
					mesh.instanceColor.needsUpdate = true;
				}
			}
		});
	}

	public resetVisuals(): void {
		this.notesByTime.forEach((instance) => {
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
}
