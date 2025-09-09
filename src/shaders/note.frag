precision highp float;

// Varyings from the vertex shader
varying vec3 vColor;
varying float vState; // 0.0: normal, 1.0: active, 2.0: finished
varying float vChannel;

// Uniforms
uniform float channelOpacities[16];

void main() {
    int channelIndex = int(vChannel);
    float opacity = channelOpacities[channelIndex];

    vec3 finalColor = vColor;
    if (vState == 2.0) { // Finished
        finalColor *= 0.4; // Darken the color
    }

    // The "active" state is handled by the CPU sending a brighter vColor.

    gl_FragColor = vec4(finalColor, opacity);
}
