import * as THREE from 'three';
import { Midi } from '@tonejs/midi';
import { Note } from '@tonejs/midi/dist/Note';
import { Piano, WHITE_KEY_WIDTH, BLACK_KEY_WIDTH } from './Piano';
import { TIME_SCALE } from './constants';

const NOTE_BAR_HEIGHT = 0.2;

// A simple color palette for different MIDI channels
const CHANNEL_COLORS = [
    0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff, 0xffffff,
    0xff8800, 0x00ff88, 0x8800ff, 0x88ff00, 0x0088ff, 0xff0088, 0x888888,
    0xcc0000, 0x00cc00
];

export class NoteVisualizer {
    private scene: THREE.Scene;
    private piano: Piano;
    public noteObjects: THREE.Group;

    constructor(scene: THREE.Scene, piano: Piano) {
        this.scene = scene;
        this.piano = piano;
        this.noteObjects = new THREE.Group();
        this.scene.add(this.noteObjects);
    }

    public visualize(midi: Midi): void {
        this.clear();

        const notesByChannel = new Map<number, Note[]>();
        midi.tracks.forEach(track => {
            // Channel 9 is often the percussion track, let's ignore it for now
            if (track.channel === 9) return;

            track.notes.forEach(note => {
                if (!notesByChannel.has(track.channel)) {
                    notesByChannel.set(track.channel, []);
                }
                notesByChannel.get(track.channel)?.push(note);
            });
        });

        notesByChannel.forEach((notes, channel) => {
            const color = new THREE.Color(CHANNEL_COLORS[channel % CHANNEL_COLORS.length]);
            const material = new THREE.MeshStandardMaterial({ color, roughness: 0.5, transparent: true, opacity: 0.8 });

            // We use a single geometry for all notes in the mesh
            const geometry = new THREE.BoxGeometry(1, NOTE_BAR_HEIGHT, 1);

            const instancedMesh = new THREE.InstancedMesh(geometry, material, notes.length);
            instancedMesh.name = `channel_${channel}`;

            notes.forEach((note, index) => {
                const { midi, time, duration } = note;

                const key = this.piano.getKey(midi);
                if (!key) return; // Skip notes that are not on our 88-key piano

                const keyPosition = key.position.clone();
                const keyWidth = this.piano.isBlackKey(midi) ? BLACK_KEY_WIDTH : WHITE_KEY_WIDTH;

                const matrix = new THREE.Matrix4();
                const position = new THREE.Vector3(
                    keyPosition.x,
                    keyPosition.y + NOTE_BAR_HEIGHT / 2 + 0.1,
                    -time * TIME_SCALE - (duration * TIME_SCALE / 2)
                );
                const scale = new THREE.Vector3(keyWidth * 0.9, 1, duration * TIME_SCALE);
                const quaternion = new THREE.Quaternion();

                matrix.compose(position, quaternion, scale);
                instancedMesh.setMatrixAt(index, matrix);
            });

            this.noteObjects.add(instancedMesh);
        });
    }

    public clear(): void {
        this.noteObjects.children.forEach(child => {
            if (child instanceof THREE.InstancedMesh) {
                child.dispose();
            }
        });
        this.noteObjects.clear();
    }
}
