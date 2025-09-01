import * as THREE from 'three';

// Constants for keyboard layout
export const WHITE_KEY_WIDTH = 1.0;
const WHITE_KEY_HEIGHT = 0.4;
const WHITE_KEY_DEPTH = 5.0;

export const BLACK_KEY_WIDTH = 0.6;
const BLACK_KEY_HEIGHT = 0.6;
const BLACK_KEY_DEPTH = 3.0;

const KEY_SPACING = 0.05;

// MIDI note numbers for an 88-key piano range from 21 (A0) to 108 (C8)
const MIDI_OFFSET = 21;
const NUM_KEYS = 88;

export class Piano {
    public readonly group: THREE.Group;
    private readonly keys: Map<number, THREE.Mesh> = new Map();
    private readonly originalKeyColors: Map<number, THREE.Color> = new Map();
    private readonly activeKeyColor = new THREE.Color(0x3498db);

    constructor() {
        this.group = new THREE.Group();
        this.createKeys();
    }

    public getKey(midiNote: number): THREE.Mesh | undefined {
        return this.keys.get(midiNote);
    }

    public isBlackKey(midiNote: number): boolean {
        const noteInOctave = midiNote % 12;
        return [1, 3, 6, 8, 10].includes(noteInOctave);
    }

    public pressKey(midiNote: number): void {
        const key = this.getKey(midiNote);
        if (key && key.material instanceof THREE.MeshStandardMaterial) {
            if (!this.originalKeyColors.has(midiNote)) {
                this.originalKeyColors.set(midiNote, key.material.color.clone());
            }
            key.material.color.set(this.activeKeyColor);
        }
    }

    public releaseKey(midiNote: number): void {
        const key = this.getKey(midiNote);
        const originalColor = this.originalKeyColors.get(midiNote);
        if (key && key.material instanceof THREE.MeshStandardMaterial && originalColor) {
            key.material.color.set(originalColor);
        }
    }

    private createKeys(): void {
        const whiteKeyMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.1 });
        const blackKeyMaterial = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.1 });

        const whiteKeyGeom = new THREE.BoxGeometry(WHITE_KEY_WIDTH, WHITE_KEY_HEIGHT, WHITE_KEY_DEPTH);
        const blackKeyGeom = new THREE.BoxGeometry(BLACK_KEY_WIDTH, BLACK_KEY_HEIGHT, BLACK_KEY_DEPTH);

        let whiteKeyIndex = 0;
        let whiteKeyXPositions: number[] = [];

        // First pass: calculate white key positions
        for (let i = 0; i < NUM_KEYS; i++) {
            const midiNote = i + MIDI_OFFSET;
            const noteInOctave = midiNote % 12;
            const isBlackKey = [1, 3, 6, 8, 10].includes(noteInOctave);
            if (!isBlackKey) {
                const x = whiteKeyIndex * (WHITE_KEY_WIDTH + KEY_SPACING);
                whiteKeyXPositions.push(x);
                whiteKeyIndex++;
            }
        }
        const totalWidth = whiteKeyIndex * (WHITE_KEY_WIDTH + KEY_SPACING) - KEY_SPACING;
        const xOffset = -totalWidth / 2;

        // Second pass: create and position all keys
        whiteKeyIndex = 0;
        for (let i = 0; i < NUM_KEYS; i++) {
            const midiNote = i + MIDI_OFFSET;
            const noteInOctave = midiNote % 12;
            const isBlackKey = [1, 3, 6, 8, 10].includes(noteInOctave);

            let keyMesh: THREE.Mesh;
            if (isBlackKey) {
                keyMesh = new THREE.Mesh(blackKeyGeom, blackKeyMaterial.clone());
                const prevWhiteKeyX = whiteKeyXPositions[whiteKeyIndex - 1];
                keyMesh.position.set(
                    prevWhiteKeyX + (WHITE_KEY_WIDTH / 2) + xOffset,
                    // The Y position is set to raise the black keys visually above the white keys.
                    (BLACK_KEY_HEIGHT - WHITE_KEY_HEIGHT) / 2 + 0.1,
                    -(WHITE_KEY_DEPTH - BLACK_KEY_DEPTH) / 2
                );
            } else {
                keyMesh = new THREE.Mesh(whiteKeyGeom, whiteKeyMaterial.clone());
                const x = whiteKeyXPositions[whiteKeyIndex];
                keyMesh.position.set(x + xOffset, 0, 0);
                whiteKeyIndex++;
            }

            keyMesh.name = `key_${midiNote}`;
            this.group.add(keyMesh);
            this.keys.set(midiNote, keyMesh);
        }
    }
}
