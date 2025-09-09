// Varyings received from the vertex shader
varying vec3 vColor;
varying float vState; // 0: normal, 1: active, 2: finished

// Constants for visual effects
const float ACTIVE_BRIGHTNESS = 0.5;
const float PLAYED_DARKEN_FACTOR = 0.4;

void main() {
    vec3 finalColor = vColor;

    if (vState == 1.0) { // Active
        finalColor += vec3(ACTIVE_BRIGHTNESS);
    } else if (vState == 2.0) { // Finished
        finalColor *= PLAYED_DARKEN_FACTOR;
    }

    // The material's opacity is still controlled by the uniform
    // so we don't need to handle it here unless we want custom logic.
    gl_FragColor = vec4(finalColor, 0.9);
}
