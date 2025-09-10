// Varyings received from the vertex shader
varying vec3 vColor;
varying float vState; // 0: normal, 1: active, 2: finished
varying vec3 vNormal;

uniform float uOpacity;

// Constants for visual effects
const float ACTIVE_BRIGHTNESS = 0.5;
const float PLAYED_DARKEN_FACTOR = 0.4;

void main() {
    vec3 baseColor = vColor;

    if (vState == 1.0) { // Active
        baseColor += vec3(ACTIVE_BRIGHTNESS);
    } else if (vState == 2.0) { // Finished
        baseColor *= PLAYED_DARKEN_FACTOR;
    }

    // Basic lighting
    float ambient = 0.4;
    float diffuse = max(0.0, dot(vNormal, normalize(vec3(0.5, 1.0, 0.5))));
    vec3 lighting = vec3(ambient + diffuse);

    vec3 finalColor = baseColor * lighting;

    gl_FragColor = vec4(finalColor, uOpacity);
}
