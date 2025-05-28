// Shape formation compute shaders - handle particle transition to target positions

export const shapeFormationComputeShader = {
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
        uniform sampler2D uTargetPositions;
        uniform float uTime;
        uniform float uDeltaTime;
        uniform float uParticleCount;
        uniform float uTextureSize;
        uniform int uPass; // 0 = update positions, 1 = update velocities
        uniform float uTransitionProgress; // 0.0 = flocking, 1.0 = fully formed
        uniform float uFormationStrength; // How strong the attraction to targets is
        uniform vec3 uBoundaryMin;
        uniform vec3 uBoundaryMax;
        
        varying vec2 vUv;
        
        // Flocking forces (reduced when forming shape)
        vec3 calculateFlockingForces(vec3 pos, vec3 vel, float index) {
            float separationDistance = 2.0;
            float alignmentDistance = 6.0;
            float cohesionDistance = 8.0;
            float maxSpeed = 2.0;
            float maxForce = 0.1;
            
            vec3 separation = vec3(0.0);
            vec3 alignment = vec3(0.0);
            vec3 cohesion = vec3(0.0);
            float sepCount = 0.0;
            float aliCount = 0.0;
            float cohCount = 0.0;
            
            // Reduced neighbor checking when forming
            float stepSize = mix(8.0, 16.0, uTransitionProgress);
            
            for (float i = 0.0; i < uParticleCount; i += stepSize) {
                if (i == index) continue;
                
                float y = floor(i / uTextureSize);
                float x = i - y * uTextureSize;
                vec2 neighborUV = (vec2(x, y) + 0.5) / uTextureSize;
                
                vec4 neighborPos = texture2D(uPositions, neighborUV);
                vec4 neighborVel = texture2D(uVelocities, neighborUV);
                
                vec3 diff = pos - neighborPos.xyz;
                float dist = length(diff);
                
                if (dist > 0.0 && dist < separationDistance) {
                    separation += normalize(diff) / dist;
                    sepCount += 1.0;
                }
                
                if (dist > 0.0 && dist < alignmentDistance) {
                    alignment += neighborVel.xyz;
                    aliCount += 1.0;
                }
                
                if (dist > 0.0 && dist < cohesionDistance) {
                    cohesion += neighborPos.xyz;
                    cohCount += 1.0;
                }
            }
            
            vec3 force = vec3(0.0);
            
            if (sepCount > 0.0) {
                separation /= sepCount;
                separation = normalize(separation) * maxSpeed - vel;
                separation = length(separation) > maxForce ? normalize(separation) * maxForce : separation;
                force += separation * 1.5;
            }
            
            if (aliCount > 0.0) {
                alignment /= aliCount;
                alignment = normalize(alignment) * maxSpeed - vel;
                alignment = length(alignment) > maxForce ? normalize(alignment) * maxForce : alignment;
                force += alignment * 0.5;
            }
            
            if (cohCount > 0.0) {
                cohesion = cohesion / cohCount - pos;
                cohesion = normalize(cohesion) * maxSpeed - vel;
                cohesion = length(cohesion) > maxForce ? normalize(cohesion) * maxForce : cohesion;
                force += cohesion * 0.5;
            }
            
            return force;
        }
        
        // Shape formation forces
        vec3 calculateFormationForces(vec3 pos, vec3 vel, float index) {
            // Get target position for this particle
            float y = floor(index / uTextureSize);
            float x = index - y * uTextureSize;
            vec2 targetUV = (vec2(x, y) + 0.5) / uTextureSize;
            
            vec4 targetData = texture2D(uTargetPositions, targetUV);
            vec3 targetPos = targetData.xyz;
            float targetDensity = targetData.w;
            
            // Skip if no target (density = 0)
            if (targetDensity < 0.01) {
                return vec3(0.0);
            }
            
            // Calculate attraction to target
            vec3 toTarget = targetPos - pos;
            float distToTarget = length(toTarget);
            
            // If very close to target, stop all movement
            if (distToTarget < 0.5) {
                // Strong damping to stop movement + gentle pull to exact position
                return -vel * 5.0 + toTarget * 10.0;
            }
            
            // Strong attraction force for better shape formation
            vec3 attraction = normalize(toTarget) * min(distToTarget * 1.5, 5.0);
            
            // Much stronger attraction for denser target areas
            attraction *= (0.8 + targetDensity * 1.2);
            
            return attraction;
        }
        
        void main() {
            vec2 uv = vUv;
            vec4 position = texture2D(uPositions, uv);
            vec4 velocity = texture2D(uVelocities, uv);
            
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
            
            // Calculate forces
            vec3 flockingForce = calculateFlockingForces(pos, vel, index);
            vec3 formationForce = calculateFormationForces(pos, vel, index);
            
            // Blend forces based on transition progress
            float flockingWeight = (1.0 - uTransitionProgress) * 0.05; // Even more reduced flocking
            float formationWeight = uTransitionProgress * uFormationStrength * 2.0; // Increased formation strength
            
            vec3 totalForce = flockingForce * flockingWeight + formationForce * formationWeight;
            
            // Boundary forces
            float boundaryForce = 0.3;
            if (pos.x > uBoundaryMax.x) totalForce.x -= boundaryForce;
            if (pos.x < uBoundaryMin.x) totalForce.x += boundaryForce;
            if (pos.y > uBoundaryMax.y) totalForce.y -= boundaryForce;
            if (pos.y < uBoundaryMin.y) totalForce.y += boundaryForce;
            if (pos.z > uBoundaryMax.z) totalForce.z -= boundaryForce;
            if (pos.z < uBoundaryMin.z) totalForce.z += boundaryForce;
            
            if (uPass == 0) {
                // Update position pass
                vec3 newVel = vel + totalForce * uDeltaTime;
                
                // Limit speed based on formation state
                float maxSpeed = mix(3.0, 1.5, uTransitionProgress);
                float speed = length(newVel);
                if (speed > maxSpeed) {
                    newVel = normalize(newVel) * maxSpeed;
                }
                
                // Check if particle should be locked in place
                if (uTransitionProgress > 0.8) {
                    // Get target position for this particle
                    float y = floor(index / uTextureSize);
                    float x = index - y * uTextureSize;
                    vec2 targetUV = (vec2(x, y) + 0.5) / uTextureSize;
                    
                    vec4 targetData = texture2D(uTargetPositions, targetUV);
                    vec3 targetPos = targetData.xyz;
                    float targetDensity = targetData.w;
                    
                    if (targetDensity > 0.01) {
                        float distToTarget = length(targetPos - pos);
                        
                        // If close to target, lock position exactly at target
                        if (distToTarget < 1.0) {
                            gl_FragColor = vec4(targetPos, 1.0);
                            return;
                        }
                    }
                }
                
                vec3 newPos = pos + newVel * uDeltaTime * 10.0;
                gl_FragColor = vec4(newPos, 1.0);
                
            } else {
                // Update velocity pass
                vec3 newVel = vel + totalForce * uDeltaTime;
                
                float maxSpeed = mix(3.0, 1.5, uTransitionProgress);
                float speed = length(newVel);
                if (speed > maxSpeed) {
                    newVel = normalize(newVel) * maxSpeed;
                }
                
                // Check if particle should have zero velocity (locked in place)
                if (uTransitionProgress > 0.8) {
                    // Get target position for this particle
                    float y = floor(index / uTextureSize);
                    float x = index - y * uTextureSize;
                    vec2 targetUV = (vec2(x, y) + 0.5) / uTextureSize;
                    
                    vec4 targetData = texture2D(uTargetPositions, targetUV);
                    vec3 targetPos = targetData.xyz;
                    float targetDensity = targetData.w;
                    
                    if (targetDensity > 0.01) {
                        float distToTarget = length(targetPos - pos);
                        
                        // If close to target, set velocity to zero
                        if (distToTarget < 1.0) {
                            gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
                            return;
                        }
                    }
                }
                
                gl_FragColor = vec4(newVel, 0.0);
            }
        }
    `
} 