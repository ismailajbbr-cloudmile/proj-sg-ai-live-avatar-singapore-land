"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { Suspense, useRef, useEffect } from "react";
import { Group } from "three";

// Preload the model for better performance
useGLTF.preload("/avatar/694df247452afe2bbfdfe7dc.glb");

// ============================================================================
// CONFIGURATION CONSTANTS - Adjust these to customize avatar appearance
// ============================================================================

// Camera settings - adjust these to change camera angle and position
const CAMERA_X = 0; // left / right position
const CAMERA_Y = 0.6; // Vertical position (higher = looks down more)
const CAMERA_Z = 1; // Distance from avatar (lower = closer)
const CAMERA_TARGET_Y = 0.45; // up / down position
const CAMERA_TARGET_X = 0; // left / right position
const CAMERA_TARGET_Z = 0; // forward / backward position
const ENABLE_ZOOM = false;
const ENABLE_PAN = false;
const MIN_DISTANCE = 1;
const MAX_DISTANCE = 5;

// Lighting settings - adjust these to change brightness
const AMBIENT_LIGHT_INTENSITY = 1.0; // Overall base lighting (higher = brighter)
const DIRECTIONAL_LIGHT_INTENSITY = 1.5; // Main light source (higher = brighter)
const POINT_LIGHT_INTENSITY = 0.8; // Fill light (higher = brighter)


interface AvatarModelProps {
  isTalking: boolean;
}

function AvatarModel({ isTalking }: AvatarModelProps) {
  // Avatar vertical position - adjust this to move avatar up/down
  const AVATAR_Y_POSITION = -1.0;

  // Left arm/hand rotation settings - adjust these to position hands
  const LEFT_FOREARM_ROTATION_X = -1.5; // Rotate down (negative = down)
  const LEFT_FOREARM_ROTATION_Y = 0; // Rotate around vertical axis
  const LEFT_FOREARM_ROTATION_Z = 2.5; // Rotate inward (positive = inward for left)

  const LEFT_HAND_ROTATION_X = -0.5; // Hand tilt
  const LEFT_HAND_ROTATION_Y = -0.8; // Hand rotation
  const LEFT_HAND_ROTATION_Z = -0.1; // Hand side tilt

  // Right arm/hand rotation settings (mirrored from left)
  const RIGHT_FOREARM_ROTATION_X = LEFT_FOREARM_ROTATION_X; // Same as left
  const RIGHT_FOREARM_ROTATION_Y = LEFT_FOREARM_ROTATION_Y; // Same as left
  const RIGHT_FOREARM_ROTATION_Z = -LEFT_FOREARM_ROTATION_Z; // Mirrored (negated)

  const RIGHT_HAND_ROTATION_X = LEFT_HAND_ROTATION_X; // Same as left
  const RIGHT_HAND_ROTATION_Y = -LEFT_HAND_ROTATION_Y; // Mirrored (negated)
  const RIGHT_HAND_ROTATION_Z = -LEFT_HAND_ROTATION_Z; // Mirrored (negated)

  // Neck rotation settings - adjust these to set default neck position
  const NECK_ROTATION_X = 0.2; // Up/down rotation (positive = tilt up, negative = tilt down)
  const NECK_ROTATION_Y = 0; // Side to side rotation (positive = turn right, negative = turn left)
  const NECK_ROTATION_Z = 0; // Tilt rotation (positive = tilt right, negative = tilt left)

  // Mouth animation settings - adjust these to control mouth movement using morph targets
  const MOUTH_OPEN_INTENSITY = 0.7; // Mouth opening intensity (0 = no movement, 1.0 = full opening)
  const MOUTH_OPEN_SPEED = 3; // Speed of mouth opening/closing animation

  // Head movement during talking - adjust these to control head movement intensity
  const TALKING_HEAD_NOD_AMPLITUDE = 0.08; // Up/down nod amount (reduced from 0.2)
  const TALKING_HEAD_SHAKE_AMPLITUDE = 0.06; // Side to side shake amount (reduced from 0.15)
  const TALKING_HEAD_TILT_AMPLITUDE = 0.04; // Tilt amount (reduced from 0.1)
  const TALKING_HEAD_NOD_SPEED = 3; // Speed of nodding
  const TALKING_HEAD_SHAKE_SPEED = 2.5; // Speed of shaking
  const TALKING_HEAD_TILT_SPEED = 2; // Speed of tilting

  // Blink animation settings - adjust these to control blinking
  const BLINK_INTERVAL = 10; // Seconds between blinks (lower = blink more often)
  const BLINK_DURATION = 0.2; // Duration of each blink in seconds (lower = faster blink)

  const { scene, nodes } = useGLTF("/avatar/694df247452afe2bbfdfe7dc.glb");
  const groupRef = useRef<Group>(null);
  const headRef = useRef<any>(null);
  const neckRef = useRef<any>(null);
  const leftHandRef = useRef<any>(null);
  const rightHandRef = useRef<any>(null);
  const leftForeArmRef = useRef<any>(null);
  const rightForeArmRef = useRef<any>(null);
  const headMeshRef = useRef<any>(null); // Wolf3D_Head mesh for morph targets
  const teethMeshRef = useRef<any>(null); // Wolf3D_Teeth mesh for morph targets
  const leftEyeMeshRef = useRef<any>(null); // EyeLeft mesh for blinking
  const rightEyeMeshRef = useRef<any>(null); // EyeRight mesh for blinking

  // Find head bone and hand bones
  useEffect(() => {
    if (scene && nodes) {
      // ========================================================================
      // DEBUG: Uncomment the code below to see all available bones/meshes
      // ========================================================================
      console.log("=== MODEL STRUCTURE DEBUG ===");
      console.log("Nodes:", nodes);
      
      const allBones: any[] = [];
      const allMeshes: any[] = [];
      const allObjects: any[] = [];
      
      scene.traverse((child: any) => {
        const name = child.name || "unnamed";
        const type = child.type || "unknown";
        
        allObjects.push({ name, type, isBone: child.isBone, isMesh: child.isMesh });
        
        if (child.isBone || type === "Bone") {
          allBones.push({ name, type });
        }
        
        if (child.isMesh || type.includes("Mesh")) {
          allMeshes.push({ name, type });
        }
      });
      
      console.log("🦴 ALL BONES:", allBones);
      console.log("🎨 ALL MESHES:", allMeshes);
      console.log("📋 ALL OBJECTS:", allObjects);
      
      // Check for morph targets (blend shapes) for facial animation
      const morphTargets: any[] = [];
      scene.traverse((child: any) => {
        if (child.isMesh && child.morphTargetInfluences) {
          const morphNames = child.morphTargetDictionary || {};
          const morphInfo = {
            meshName: child.name,
            morphTargetCount: child.morphTargetInfluences.length,
            morphTargetNames: Object.keys(morphNames),
            morphTargetDictionary: morphNames,
            mesh: child
          };
          morphTargets.push(morphInfo);
          
          // Store references to head and teeth meshes for mouth animation
          if (child.name === "Wolf3D_Head" && !headMeshRef.current) {
            headMeshRef.current = child;
            console.log("✅ Head mesh found with morph targets:", Object.keys(morphNames));
          }
          if (child.name === "Wolf3D_Teeth" && !teethMeshRef.current) {
            teethMeshRef.current = child;
            console.log("✅ Teeth mesh found with morph targets:", Object.keys(morphNames));
          }
          // Store references to eye meshes for blinking
          if (child.name === "EyeLeft" && !leftEyeMeshRef.current) {
            leftEyeMeshRef.current = child;
            console.log("✅ Left eye mesh found with morph targets:", Object.keys(morphNames));
          }
          if (child.name === "EyeRight" && !rightEyeMeshRef.current) {
            rightEyeMeshRef.current = child;
            console.log("✅ Right eye mesh found with morph targets:", Object.keys(morphNames));
          }
        }
      });
      
      // Also try to find eye meshes from nodes directly
      if (!leftEyeMeshRef.current && nodes.EyeLeft) {
        leftEyeMeshRef.current = nodes.EyeLeft;
        console.log("✅ Left eye mesh found via nodes");
      }
      if (!rightEyeMeshRef.current && nodes.EyeRight) {
        rightEyeMeshRef.current = nodes.EyeRight;
        console.log("✅ Right eye mesh found via nodes");
      }
      
      console.log("😊 MORPH TARGETS (Blend Shapes):", morphTargets);
      console.log("=== END DEBUG ===");
      // ========================================================================

      // Find all bones needed for animation (single traversal for efficiency)
      scene.traverse((child: any) => {
        if (!(child.isBone || child.type === "Bone")) return;
        
        const name = child.name || "";
        const nameLower = name.toLowerCase();
        
        // Find bones by name
        if (nameLower === "head" && !headRef.current) {
          headRef.current = child;
        } else if (name === "Neck" && !neckRef.current) {
          neckRef.current = child;
        } else if (name === "LeftHand" && !leftHandRef.current) {
          leftHandRef.current = child;
        } else if (name === "RightHand" && !rightHandRef.current) {
          rightHandRef.current = child;
        } else if (name === "LeftForeArm" && !leftForeArmRef.current) {
          leftForeArmRef.current = child;
        } else if (name === "RightForeArm" && !rightForeArmRef.current) {
          rightForeArmRef.current = child;
        }
      });
    }
  }, [scene, nodes]);

  // Animate the avatar with idle movements and talking animation
  useFrame((state) => {
    const currentTime = state.clock.elapsedTime;

    if (isTalking) {
      // Talking animation: head and mouth movements only (no body bobbing)
      
      // Fixed position - no up/down movement
      if (groupRef.current) {
        groupRef.current.position.y = AVATAR_Y_POSITION;
      }

      // Head movement during talking (subtle)
      if (headRef.current) {
        // Nodding up and down
        headRef.current.rotation.x = Math.sin(currentTime * TALKING_HEAD_NOD_SPEED) * TALKING_HEAD_NOD_AMPLITUDE;
        // Slight head shake side to side
        headRef.current.rotation.y = Math.sin(currentTime * TALKING_HEAD_SHAKE_SPEED) * TALKING_HEAD_SHAKE_AMPLITUDE;
        // Slight tilt
        headRef.current.rotation.z = Math.sin(currentTime * TALKING_HEAD_TILT_SPEED) * TALKING_HEAD_TILT_AMPLITUDE;
        
        // Reset head scale (no mouth animation on head bone)
        headRef.current.scale.set(1, 1, 1);
      } else if (groupRef.current) {
        // Fallback: apply to whole model if head bone not found
        groupRef.current.rotation.x = Math.sin(currentTime * TALKING_HEAD_NOD_SPEED) * TALKING_HEAD_NOD_AMPLITUDE * 1.5;
        groupRef.current.rotation.y = Math.sin(currentTime * TALKING_HEAD_SHAKE_SPEED) * TALKING_HEAD_SHAKE_AMPLITUDE * 1.5;
      }

      // Mouth animation using morph targets (blend shapes)
      if (MOUTH_OPEN_INTENSITY > 0) {
        const mouthOpen = Math.abs(Math.sin(currentTime * MOUTH_OPEN_SPEED)) * MOUTH_OPEN_INTENSITY;
        
        // Animate head mesh morph targets
        if (headMeshRef.current && headMeshRef.current.morphTargetInfluences) {
          // Apply mouth opening to all morph targets on head (usually 2 targets)
          for (let i = 0; i < headMeshRef.current.morphTargetInfluences.length; i++) {
            headMeshRef.current.morphTargetInfluences[i] = mouthOpen;
          }
        }
        
        // Animate teeth mesh morph targets
        if (teethMeshRef.current && teethMeshRef.current.morphTargetInfluences) {
          // Apply mouth opening to all morph targets on teeth (usually 2 targets)
          for (let i = 0; i < teethMeshRef.current.morphTargetInfluences.length; i++) {
            teethMeshRef.current.morphTargetInfluences[i] = mouthOpen;
          }
        }
      } else {
        // Reset morph targets when not talking
        if (headMeshRef.current && headMeshRef.current.morphTargetInfluences) {
          for (let i = 0; i < headMeshRef.current.morphTargetInfluences.length; i++) {
            headMeshRef.current.morphTargetInfluences[i] = 0;
          }
        }
        if (teethMeshRef.current && teethMeshRef.current.morphTargetInfluences) {
          for (let i = 0; i < teethMeshRef.current.morphTargetInfluences.length; i++) {
            teethMeshRef.current.morphTargetInfluences[i] = 0;
          }
        }
      }

      // Fixed scale - no pulsing/breathing effect
      if (groupRef.current) {
        groupRef.current.scale.set(1, 1, 1);
      }
    } else {
      // Idle animation: subtle head movement only (no bobbing)
      if (groupRef.current) {
        // Fixed position - no up/down movement, adjusted for upper body focus
        groupRef.current.position.y = AVATAR_Y_POSITION;
        groupRef.current.rotation.x = 0;
        groupRef.current.rotation.y = 0;
        groupRef.current.scale.set(1, 1, 1);
      }

      // Subtle head movement when idle
      if (headRef.current) {
        // Gentle head rotation side to side (increased movement)
        headRef.current.rotation.y = Math.sin(currentTime * 0.3) * 0.12;
        // Subtle head tilt (increased movement)
        headRef.current.rotation.z = Math.sin(currentTime * 0.25) * 0.08;
        // Very slight up/down nod
        headRef.current.rotation.x = Math.sin(currentTime * 0.2) * 0.05;
        headRef.current.scale.set(1, 1, 1);
      }

      // Reset morph targets when idle
      if (headMeshRef.current && headMeshRef.current.morphTargetInfluences) {
        for (let i = 0; i < headMeshRef.current.morphTargetInfluences.length; i++) {
          headMeshRef.current.morphTargetInfluences[i] = 0;
        }
      }
      if (teethMeshRef.current && teethMeshRef.current.morphTargetInfluences) {
        for (let i = 0; i < teethMeshRef.current.morphTargetInfluences.length; i++) {
          teethMeshRef.current.morphTargetInfluences[i] = 0;
        }
      }
    }

    // Blink animation (applies to both idle and talking)
    // Uses scale on eye meshes since morph targets don't have blink-specific targets
    // Calculate blink state: blink happens during BLINK_DURATION, then waits
    const timeInCycle = currentTime % BLINK_INTERVAL;
    let blinkScale = 1.0; // 1.0 = open, 0.0 = closed
    
    if (timeInCycle < BLINK_DURATION) {
      // Blink closing and opening (smooth transition)
      const blinkProgress = timeInCycle / BLINK_DURATION; // 0 to 1
      // Use sine wave: starts at 1 (open), goes to 0 (closed), back to 1 (open)
      blinkScale = 1.0 - Math.sin(blinkProgress * Math.PI);
    }
    
    // Apply blink scale to both eyes (scaling down closes the eyes)
    if (leftEyeMeshRef.current) {
      leftEyeMeshRef.current.scale.set(1, blinkScale, 1);
    }
    if (rightEyeMeshRef.current) {
      rightEyeMeshRef.current.scale.set(1, blinkScale, 1);
    }

    // Set neck default position (applies to both idle and talking)
    if (neckRef.current) {
      neckRef.current.rotation.x = NECK_ROTATION_X;
      neckRef.current.rotation.y = NECK_ROTATION_Y;
      neckRef.current.rotation.z = NECK_ROTATION_Z;
    }

    // Position hands together as if resting on a table (applies to both idle and talking)
    if (leftForeArmRef.current && leftHandRef.current) {
      // Left forearm: rotate forward and down
      leftForeArmRef.current.rotation.x = LEFT_FOREARM_ROTATION_X;
      leftForeArmRef.current.rotation.y = LEFT_FOREARM_ROTATION_Y;
      leftForeArmRef.current.rotation.z = LEFT_FOREARM_ROTATION_Z;
      // Left hand: position forward and rotate to be flat
      leftHandRef.current.rotation.x = LEFT_HAND_ROTATION_X;
      leftHandRef.current.rotation.y = LEFT_HAND_ROTATION_Y;
      leftHandRef.current.rotation.z = LEFT_HAND_ROTATION_Z;
    }

    if (rightForeArmRef.current && rightHandRef.current) {
      // Right forearm: rotate forward and down (mirrored from left)
      rightForeArmRef.current.rotation.x = RIGHT_FOREARM_ROTATION_X;
      rightForeArmRef.current.rotation.y = RIGHT_FOREARM_ROTATION_Y;
      rightForeArmRef.current.rotation.z = RIGHT_FOREARM_ROTATION_Z;
      // Right hand: position forward and rotate to be flat (mirrored from left)
      rightHandRef.current.rotation.x = RIGHT_HAND_ROTATION_X;
      rightHandRef.current.rotation.y = RIGHT_HAND_ROTATION_Y;
      rightHandRef.current.rotation.z = RIGHT_HAND_ROTATION_Z;
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={scene} scale={1} />
    </group>
  );
}

interface AvatarProps {
  isTalking?: boolean;
}

export default function Avatar({ isTalking = false }: AvatarProps) {
  return (
    <div className="h-full w-full bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-900 dark:to-zinc-800">
      <Canvas camera={{ position: [CAMERA_X, CAMERA_Y, CAMERA_Z], fov: 50 }}>
        <ambientLight intensity={AMBIENT_LIGHT_INTENSITY} />
        <directionalLight position={[10, 10, 5]} intensity={DIRECTIONAL_LIGHT_INTENSITY} />
        <pointLight position={[-10, -10, -5]} intensity={POINT_LIGHT_INTENSITY} />
        <Suspense fallback={null}>
          <AvatarModel isTalking={isTalking} />
        </Suspense>
        <OrbitControls
          enableZoom={ENABLE_ZOOM}
          enablePan={ENABLE_PAN}
          minDistance={MIN_DISTANCE}
          maxDistance={MAX_DISTANCE}
          target={[CAMERA_TARGET_X, CAMERA_TARGET_Y, CAMERA_TARGET_Z]}
        />
      </Canvas>
    </div>
  );
}

