// Attributes for the base geometry
attribute vec3 position;
attribute vec2 uv;

// Attributes for each instance
attribute mat4 instanceMatrix;
attribute vec3 instanceColor;
attribute float instanceNoteTime;
attribute float instanceNoteDuration;
attribute float instanceChannel;

// Uniforms passed from the CPU
uniform float elapsedTime;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat4 modelMatrix;

// Varyings passed to the fragment shader
varying vec3 vColor;
varying float vState; // 0.0: normal, 1.0: active, 2.0: finished
varying float vChannel;

void main() {
    // Determine the state of the note
    float noteStartTime = instanceNoteTime;
    float noteEndTime = instanceNoteTime + instanceNoteDuration;

    if (elapsedTime > noteStartTime && elapsedTime <= noteEndTime) {
        // This is a rough check for "active". The more accurate "active"
        // state will be managed by the CPU by overwriting the color.
        // We use vColor to pass the final color to the fragment shader.
        vState = 1.0;
    } else if (elapsedTime > noteEndTime) {
        vState = 2.0; // Finished
    } else {
        vState = 0.0; // Normal
    }

    vColor = instanceColor;
    vChannel = instanceChannel;

    gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
}
