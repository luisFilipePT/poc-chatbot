// Flocking compute shaders - handle particle behavior calculations

export const flockingComputeShader = {
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D uPositions;
        uniform sampler2D uVelocities;
        uniform float uTime;
        uniform float uDeltaTime;
        uniform float uParticleCount;
        uniform float uTextureSize;
        uniform int uPass; // 0 = update positions, 1 = update velocities
        uniform vec3 uBoundaryMin; // Dynamic minimum boundaries
        uniform vec3 uBoundaryMax; // Dynamic maximum boundaries
        
        varying vec2 vUv;
        
        vec3 calculateFlockingForces(vec3 pos, vec3 vel, float index) {
            // Flocking parameters
            float separationDistance = 3.0;
            float alignmentDistance = 8.0;
            float cohesionDistance = 12.0;
            float maxSpeed = 3.0;
            float maxForce = 0.15;
            
            // Flocking forces
            vec3 separation = vec3(0.0);
            vec3 alignment = vec3(0.0);
            vec3 cohesion = vec3(0.0);
            float sepCount = 0.0;
            float aliCount = 0.0;
            float cohCount = 0.0;
            
            // Check neighbors (sample every few particles for performance)
            for (float i = 0.0; i < uParticleCount; i += 8.0) {
                if (i == index) continue;
                
                // Convert index to UV
                float y = floor(i / uTextureSize);
                float x = i - y * uTextureSize;
                vec2 neighborUV = (vec2(x, y) + 0.5) / uTextureSize;
                
                vec4 neighborPos = texture2D(uPositions, neighborUV);
                vec4 neighborVel = texture2D(uVelocities, neighborUV);
                
                vec3 diff = pos - neighborPos.xyz;
                float dist = length(diff);
                
                // Separation
                if (dist > 0.0 && dist < separationDistance) {
                    separation += normalize(diff) / dist;
                    sepCount += 1.0;
                }
                
                // Alignment
                if (dist > 0.0 && dist < alignmentDistance) {
                    alignment += neighborVel.xyz;
                    aliCount += 1.0;
                }
                
                // Cohesion
                if (dist > 0.0 && dist < cohesionDistance) {
                    cohesion += neighborPos.xyz;
                    cohCount += 1.0;
                }
            }
            
            // Apply forces
            vec3 force = vec3(0.0);
            
            // Separation
            if (sepCount > 0.0) {
                separation /= sepCount;
                separation = normalize(separation) * maxSpeed - vel;
                separation = length(separation) > maxForce ? normalize(separation) * maxForce : separation;
                force += separation * 2.0;
            }
            
            // Alignment
            if (aliCount > 0.0) {
                alignment /= aliCount;
                alignment = normalize(alignment) * maxSpeed - vel;
                alignment = length(alignment) > maxForce ? normalize(alignment) * maxForce : alignment;
                force += alignment * 1.0;
            }
            
            // Cohesion
            if (cohCount > 0.0) {
                cohesion = cohesion / cohCount - pos;
                cohesion = normalize(cohesion) * maxSpeed - vel;
                cohesion = length(cohesion) > maxForce ? normalize(cohesion) * maxForce : cohesion;
                force += cohesion * 1.0;
            }
            
            // Dynamic boundary forces (screen size + 2% buffer)
            float boundaryForce = 0.5;
            
            if (pos.x > uBoundaryMax.x) force.x -= boundaryForce;
            if (pos.x < uBoundaryMin.x) force.x += boundaryForce;
            if (pos.y > uBoundaryMax.y) force.y -= boundaryForce;
            if (pos.y < uBoundaryMin.y) force.y += boundaryForce;
            if (pos.z > uBoundaryMax.z) force.z -= boundaryForce;
            if (pos.z < uBoundaryMin.z) force.z += boundaryForce;
            
            return force;
        }
        
        void main() {
            vec2 uv = vUv;
            vec4 position = texture2D(uPositions, uv);
            vec4 velocity = texture2D(uVelocities, uv);
            
            // Skip empty pixels
            float index = floor(uv.y * uTextureSize) * uTextureSize + floor(uv.x * uTextureSize);
            if (index >= uParticleCount) {
                if (uPass == 0) {
                    gl_FragColor = position;
                } else {
                    gl_FragColor = velocity;
                }
                return;
            }
            
            vec3 pos = position.xyz;
            vec3 vel = velocity.xyz;
            
            // Calculate flocking forces ONCE
            vec3 force = calculateFlockingForces(pos, vel, index);
            
            if (uPass == 0) {
                // Update position pass
                vec3 newVel = vel + force * uDeltaTime;
                
                // Limit speed
                float speed = length(newVel);
                float maxSpeed = 3.0;
                if (speed > maxSpeed) {
                    newVel = normalize(newVel) * maxSpeed;
                }
                
                // Update position
                vec3 newPos = pos + newVel * uDeltaTime * 10.0;
                gl_FragColor = vec4(newPos, 1.0);
                
            } else {
                // Update velocity pass
                vec3 newVel = vel + force * uDeltaTime;
                
                // Limit speed
                float speed = length(newVel);
                float maxSpeed = 3.0;
                if (speed > maxSpeed) {
                    newVel = normalize(newVel) * maxSpeed;
                }
                
                gl_FragColor = vec4(newVel, 0.0);
            }
        }
    `
}