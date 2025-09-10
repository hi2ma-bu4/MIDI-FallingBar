// Attributes for each instance
attribute vec2 aNoteData; // x: time, y: duration
attribute vec3 aOriginalColor;

// Uniforms that are the same for all instances
uniform float uElapsedTime;

// Varyings to pass data to the fragment shader
varying vec3 vColor;
varying float vState; // 0: normal, 1: active, 2: finished
varying vec3 vNormal;

const float VISIBLE_START_TIME_OFFSET = 5.0;
const float VISIBLE_END_TIME_OFFSET = 15.0;

void main() {
    vNormal = normalize(normalMatrix * normal);

    float noteTime = aNoteData.x;
    float noteDuration = aNoteData.y;

    // Determine visibility
    float visibleStartTime = uElapsedTime - VISIBLE_START_TIME_OFFSET;
    float visibleEndTime = uElapsedTime + VISIBLE_END_TIME_OFFSET;

    mat4 instanceMatrixMod = instanceMatrix;

    if (noteTime + noteDuration < visibleStartTime || noteTime > visibleEndTime) {
        // Hide instance by scaling it to zero
        instanceMatrixMod[0][0] = 0.0;
        instanceMatrixMod[1][1] = 0.0;
        instanceMatrixMod[2][2] = 0.0;
    }

    // Determine note state
    float noteEndTime = noteTime + noteDuration;
    if (uElapsedTime >= noteTime && uElapsedTime < noteEndTime) {
        vState = 1.0; // Active
    } else if (uElapsedTime >= noteEndTime) {
        vState = 2.0; // Finished
    } else {
        vState = 0.0; // Normal
    }

    vColor = aOriginalColor;

    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrixMod * vec4(position, 1.0);
}
