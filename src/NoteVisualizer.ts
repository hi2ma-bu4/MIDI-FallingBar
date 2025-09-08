import type { Midi } from "@tonejs/midi";
import type { Note } from "@tonejs/midi/dist/Note";
import { BoxGeometry, Color, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Scene, ShaderMaterial, Vector3 } from "three";
import { BLACK_KEY_WIDTH, Piano, WHITE_KEY_HEIGHT, WHITE_KEY_WIDTH } from "./Piano";
import { TIME_SCALE } from "./constants";

const NOTE_BAR_HEIGHT = 0.2;
export const ACTIVE_BRIGHTNESS = 0.5;
const PLAYED_DARKEN_FACTOR = 0.4;

// A simple color palette for different MIDI channels
export const CHANNEL_COLORS = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff, 0xffffff, 0xff8800, 0x00ff88, 0x8800ff, 0x88ff00, 0x0088ff, 0xff0088, 0x888888, 0xcc0000, 0x00cc00];

const vertexShader = `
	uniform float u_time;
	uniform float u_time_scale;

	attribute vec3 aOffset;
	attribute vec3 aColor;
	attribute float aScaleX;
	attribute float aScaleZ;
	attribute float aStartTime;
	attribute float aDuration;
	attribute float aState;

	varying vec3 vColor;
	varying float vState;

	void main() {
			vColor = aColor;
			vState = aState;
			mat4 instanceMatrix = mat4(
					vec4(aScaleX, 0.0, 0.0, 0.0),
					vec4(0.0, 1.0, 0.0, 0.0),
					vec4(0.0, 0.0, aScaleZ, 0.0),
					vec4(aOffset.x, aOffset.y, aOffset.z, 1.0)
			);
			gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
	}
`;

const fragmentShader = `
	varying vec3 vColor;
	varying float vState;

	uniform float u_active_brightness;
	uniform float u_played_darken_factor;
	uniform float u_opacity;

	void main() {
			vec3 finalColor = vColor;
			if (vState == 1.0) { // active
					finalColor += u_active_brightness;
			} else if (vState == 2.0) { // finished
					finalColor *= u_played_darken_factor;
			}
			gl_FragColor = vec4(finalColor, u_opacity);
	}
`;

interface NoteInstance {
	instanceId: number;
	note: Note;
	channel: number;
	state: "normal" | "active" | "finished";
	mesh: InstancedMesh<BoxGeometry, ShaderMaterial>;
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
	private tempColor = new Color();

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
			const material = new ShaderMaterial({
				uniforms: {
					u_time: { value: 0.0 },
					u_time_scale: { value: TIME_SCALE },
					u_active_brightness: { value: ACTIVE_BRIGHTNESS },
					u_played_darken_factor: { value: PLAYED_DARKEN_FACTOR },
					u_opacity: { value: 0.9 },
				},
				vertexShader,
				fragmentShader,
				transparent: true,
			});

			const geometry = new BoxGeometry(1, NOTE_BAR_HEIGHT, 1);
			const instancedMesh = new InstancedMesh(geometry, material, notes.length);
			instancedMesh.name = `channel_${channel}`;

			const offsets = new Float32Array(notes.length * 3);
			const colors = new Float32Array(notes.length * 3);
			const scalesX = new Float32Array(notes.length);
			const scalesZ = new Float32Array(notes.length);
			const startTimes = new Float32Array(notes.length);
			const durations = new Float32Array(notes.length);
			const states = new Float32Array(notes.length);

			notes.forEach((note, index) => {
				const { midi, time, duration } = note;
				const key = this.piano.getKey(midi);
				if (!key) return;

				const keyPosition = key.position.clone();
				const keyWidth = this.piano.isBlackKey(midi) ? BLACK_KEY_WIDTH : WHITE_KEY_WIDTH;
				const yOffset = channel * 0.001;
				const keyTopY = WHITE_KEY_HEIGHT / 2;
				const barY = keyTopY - NOTE_BAR_HEIGHT / 2 - 0.01;
				const position = new Vector3(keyPosition.x, barY + yOffset, -time * TIME_SCALE - (duration * TIME_SCALE) / 2);

				offsets[index * 3] = position.x;
				offsets[index * 3 + 1] = position.y;
				offsets[index * 3 + 2] = position.z;

				const baseColor = new Color(CHANNEL_COLORS[channel % CHANNEL_COLORS.length]);
				colors[index * 3] = baseColor.r;
				colors[index * 3 + 1] = baseColor.g;
				colors[index * 3 + 2] = baseColor.b;

				scalesX[index] = keyWidth * 0.9;
				scalesZ[index] = duration * TIME_SCALE;
				startTimes[index] = time;
				durations[index] = duration;
				states[index] = 0.0; // 0: normal, 1: active, 2: finished

				const noteKey = `${note.midi}-${note.time}-${channel}`;
				const noteInstance: NoteInstance = {
					mesh: instancedMesh,
					instanceId: index,
					note,
					channel: channel,
					state: "normal",
				};
				this.noteMap.set(noteKey, noteInstance);
			});

			geometry.setAttribute("aOffset", new InstancedBufferAttribute(offsets, 3));
			geometry.setAttribute("aColor", new InstancedBufferAttribute(colors, 3));
			geometry.setAttribute("aScaleX", new InstancedBufferAttribute(scalesX, 1));
			geometry.setAttribute("aScaleZ", new InstancedBufferAttribute(scalesZ, 1));
			geometry.setAttribute("aStartTime", new InstancedBufferAttribute(startTimes, 1));
			geometry.setAttribute("aDuration", new InstancedBufferAttribute(durations, 1));
			geometry.setAttribute("aState", new InstancedBufferAttribute(states, 1));

			this.noteObjects.add(instancedMesh);
		});
		this.notesByTime = Array.from(this.noteMap.values()).sort((a, b) => a.note.time - b.note.time);
	}

	public update(elapsedTime: number, activeNotes: Map<string, PlayableNote>, isSuperLightweight = false): void {
		this.noteObjects.children.forEach((mesh) => {
			if (mesh instanceof InstancedMesh && mesh.material instanceof ShaderMaterial) {
				mesh.material.uniforms.u_time.value = elapsedTime;
			}
		});

		if (isSuperLightweight) return;

		const activeNoteKeys = new Set(activeNotes.keys());
		let stateChanged = false;

		this.notesByTime.forEach((instance) => {
			const { note, channel, instanceId, mesh } = instance;
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
				const stateAttribute = mesh.geometry.getAttribute("aState") as InstancedBufferAttribute;
				let stateValue = 0.0;
				if (newState === "active") stateValue = 1.0;
				else if (newState === "finished") stateValue = 2.0;

				stateAttribute.setX(instanceId, stateValue);
				stateAttribute.needsUpdate = true;
				stateChanged = true;
			}
		});
	}

	public resetVisuals(): void {
		this.notesByTime.forEach((instance) => {
			if (instance.state !== "normal") {
				instance.state = "normal";
				const { mesh, instanceId } = instance;
				const stateAttribute = mesh.geometry.getAttribute("aState") as InstancedBufferAttribute;
				stateAttribute.setX(instanceId, 0.0);
				stateAttribute.needsUpdate = true;
			}
		});
	}

	public clear(): void {
		this.noteObjects.children.forEach((child) => {
			if (child instanceof InstancedMesh) {
				child.geometry.dispose();
				(child.material as ShaderMaterial).dispose();
			}
		});
		this.noteObjects.clear();
		this.noteMap.clear();
		this.notesByTime = [];
	}

	public setChannelOpacity(channel: number, opacity: number): void {
		const meshName = `channel_${channel}`;
		const mesh = this.noteObjects.getObjectByName(meshName) as InstancedMesh<BoxGeometry, ShaderMaterial>;
		if (mesh) {
			mesh.material.uniforms.u_opacity.value = opacity;
		}
	}
}
