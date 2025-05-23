export const particleVertexShader = `
  attribute float size;
  attribute float filled;
  varying float vFilled;
  varying vec3 vColor;
  
  void main() {
    vColor = color;
    vFilled = filled;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const particleFragmentShader = `
  varying vec3 vColor;
  varying float vFilled;
  uniform bool isDarkTheme;
  
  void main() {
    vec2 center = gl_PointCoord - 0.5;
    float dist = length(center);
    
    if (dist > 0.5) {
      discard;
    }
    
    if (vFilled < 0.5) {
      // Hollow circle
      if (dist < 0.4) {
        discard;
      }
      gl_FragColor = vec4(vColor, 1.0);
    } else {
      // Filled circle with gradient for light theme
      float alpha = 1.0;
      if (!isDarkTheme) {
        // Soft edges for light theme
        alpha = 1.0 - smoothstep(0.3, 0.5, dist);
      }
      gl_FragColor = vec4(vColor, alpha);
    }
  }
`;



