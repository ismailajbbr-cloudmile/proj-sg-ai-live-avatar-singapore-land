"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { Suspense, useRef, useEffect } from "react";
import { Group } from "three";

// Preload the model for better performance
useGLTF.preload("/avatar/avatar_1.glb");

// ============================================================================
// CONFIGURATION CONSTANTS - Adjust these to customize avatar appearance
// ============================================================================

// Camera settings - adjust these to change camera angle and position
// Camera position: Where the camera is located in 3D space
const CAMERA_X = 0; // Camera horizontal position (left = negative, right = positive)
const CAMERA_Y = 0; // Camera vertical position (the camera's height in 3D space)
const CAMERA_Z = 0; // Camera distance from avatar (lower = closer/zoom in, higher = farther/zoom out)

// Camera target: Where the camera is looking at (the point the camera focuses on)
// NOTE: The relationship between CAMERA_Y and CAMERA_TARGET_Y determines the camera angle:
//   - If CAMERA_Y < CAMERA_TARGET_Y: camera looks upward
//   - If CAMERA_Y > CAMERA_TARGET_Y: camera looks downward
//   - If CAMERA_Y = CAMERA_TARGET_Y: camera looks straight ahead horizontally
const CAMERA_TARGET_X = 0; // Target horizontal position (left = negative, right = positive)
const CAMERA_TARGET_Y = 0; // Target vertical position (where the camera is pointing vertically)
const CAMERA_TARGET_Z = -1.2; // Target depth position (negative = forward, positive = backward) // zoom

// Avatar vertical position - adjust this to move avatar up/down
const AVATAR_Y_POSITION = -1.5;

// Camera field of view: Controls how wide/narrow the camera view is
const CAMERA_FOV = 50; // Field of view in degrees (lower = more zoom/narrower view, higher = wider view)

// Camera controls: Enable/disable user interactions with the camera
const ENABLE_ZOOM = true; // Allow user to zoom in/out with mouse wheel or pinch
const ENABLE_PAN = false; // Allow user to drag/move the camera horizontally/vertically
const ENABLE_ROTATE = true; // Allow user to rotate the camera around the avatar

// Camera distance limits: Constrain how close/far the camera can get (only applies if zoom is enabled)
const MIN_DISTANCE = 2; // Minimum distance the camera can zoom in (closest)
const MAX_DISTANCE = 6; // Maximum distance the camera can zoom out (farthest)

// Lighting settings - adjust these to change brightness and shadows
// Ambient light: Provides overall base lighting to all objects (no shadows, fills dark areas)
const AMBIENT_LIGHT_INTENSITY = 2; // Overall base lighting (0 = dark, higher = brighter)

// Directional light: Simulates sunlight (directional, creates shadows)
const DIRECTIONAL_LIGHT_INTENSITY = 2; // Main light source intensity (0 = off, higher = brighter)

// Point light: Simulates a light bulb (radiates in all directions from a point)
const POINT_LIGHT_INTENSITY = 2; // Fill light intensity (0 = off, higher = brighter)


interface AvatarModelProps {
  isTalking: boolean;
}

function AvatarModel({ isTalking }: AvatarModelProps) {

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
  const NECK_ROTATION_X = 0.3; // Up/down rotation (positive = tilt up, negative = tilt down)
  const NECK_ROTATION_Y = 0; // Side to side rotation (positive = turn right, negative = turn left)
  const NECK_ROTATION_Z = 0; // Tilt rotation (positive = tilt right, negative = tilt left)

  // Idle mouth shape - set the default mouth position when not talking
  // You can use values from 0-1, or reference a viseme name from CUSTOM_VISEMES
  const IDLE_MOUTH_OPEN = 0; // Idle mouthOpen value (0 = closed, 1.0 = fully open)
  const IDLE_MOUTH_SMILE = 0.2; // Idle mouthSmile value (0 = no smile, 1.0 = full smile)
  
  // Mouth animation settings - using morph targets (mouthOpen, mouthSmile)
  const MOUTH_INTENSITY = 1.5; // Mouth movement intensity (0 = no movement, 1.0 = full movement)
  const MOUTH_SPEED = 3; // Speed of mouth animation (higher = faster speech)
  
  // Custom visemes built from mouthOpen and mouthSmile combinations
  // Each viseme is defined as [mouthOpen, mouthSmile] where values are 0-1
  const CUSTOM_VISEMES = [
    { name: "silence", open: 0.0, smile: 0.0 },      // Silence/rest
    { name: "closed", open: 0.1, smile: 0.0 },        // M, P, B (closed lips)
    { name: "narrow", open: 0.3, smile: 0.2 },        // F, V (narrow opening)
    { name: "wide", open: 0.8, smile: 0.1 },         // A, O (wide open)
    { name: "smile_open", open: 0.6, smile: 0.7 },    // E, I (smile with opening)
    { name: "open", open: 0.7, smile: 0.0 },         // U, OO (round open)
    { name: "smile", open: 0.2, smile: 0.8 },        // E, EE (wide smile)
    { name: "narrow_open", open: 0.5, smile: 0.1 },  // D, T, L (medium open)
    { name: "wide_smile", open: 0.4, smile: 0.9 },   // I, Y (very wide smile)
    { name: "round", open: 0.6, smile: 0.0 },        // O, OH (round mouth)
  ];

  // Head movement during talking - adjust these to control head movement intensity
  const TALKING_HEAD_NOD_AMPLITUDE = 0.04; // Up/down nod amount (reduced for less movement)
  const TALKING_HEAD_SHAKE_AMPLITUDE = 0.04; // Side to side shake amount (reduced for less movement)
  const TALKING_HEAD_TILT_AMPLITUDE = 0.03; // Tilt amount (reduced for less movement)
  const TALKING_HEAD_NOD_SPEED = 2.5; // Speed of nodding
  const TALKING_HEAD_SHAKE_SPEED = 2.5; // Speed of shaking
  const TALKING_HEAD_TILT_SPEED = 2.5; // Speed of tilting

  // Blink animation settings - adjust these to control blinking
  const BLINK_INTERVAL = 10; // Seconds between blinks (lower = blink more often)
  const BLINK_DURATION = 0.2; // Duration of each blink in seconds (lower = faster blink)

  const { scene, nodes } = useGLTF("/avatar/avatar_1.glb");
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

      // Mouth animation using custom visemes built from mouthOpen and mouthSmile
      // Cycles through different viseme states and blends between them for smooth transitions
      if (MOUTH_INTENSITY > 0 && headMeshRef.current && headMeshRef.current.morphTargetInfluences) {
        const morphDict = headMeshRef.current.morphTargetDictionary || {};
        
        // Reset all morph targets first
        for (let i = 0; i < headMeshRef.current.morphTargetInfluences.length; i++) {
          headMeshRef.current.morphTargetInfluences[i] = 0;
        }
        
        // Cycle through custom visemes continuously
        const cycleTime = currentTime * MOUTH_SPEED;
        const visemeIndex = Math.floor(cycleTime) % CUSTOM_VISEMES.length;
        const nextVisemeIndex = (visemeIndex + 1) % CUSTOM_VISEMES.length;
        const blendFactor = cycleTime % 1; // 0 to 1 for blending between visemes
        
        const currentViseme = CUSTOM_VISEMES[visemeIndex];
        const nextViseme = CUSTOM_VISEMES[nextVisemeIndex];
        
        // Interpolate between current and next viseme for smooth transition
        const mouthOpenValue = (currentViseme.open * (1 - blendFactor) + nextViseme.open * blendFactor) * MOUTH_INTENSITY;
        const mouthSmileValue = (currentViseme.smile * (1 - blendFactor) + nextViseme.smile * blendFactor) * MOUTH_INTENSITY;
        
        // Apply mouthOpen (clamped to 0-1)
        if (morphDict["mouthOpen"] !== undefined) {
          headMeshRef.current.morphTargetInfluences[morphDict["mouthOpen"]] = Math.min(Math.max(mouthOpenValue, 0), 1.0);
        }
        
        // Apply mouthSmile (clamped to 0-1)
        if (morphDict["mouthSmile"] !== undefined) {
          headMeshRef.current.morphTargetInfluences[morphDict["mouthSmile"]] = Math.min(Math.max(mouthSmileValue, 0), 1.0);
        }
      }
      
      // Animate teeth mesh morph targets (use mouthOpen)
      if (teethMeshRef.current && teethMeshRef.current.morphTargetInfluences) {
        const morphDict = teethMeshRef.current.morphTargetDictionary || {};
        const mouthOpen = Math.abs(Math.sin(currentTime * MOUTH_SPEED * 2)) * MOUTH_INTENSITY;
        
        // Reset all morph targets
        for (let i = 0; i < teethMeshRef.current.morphTargetInfluences.length; i++) {
          teethMeshRef.current.morphTargetInfluences[i] = 0;
        }
        
        // Apply mouthOpen if it exists
        if (morphDict["mouthOpen"] !== undefined) {
          teethMeshRef.current.morphTargetInfluences[morphDict["mouthOpen"]] = mouthOpen * 0.5;
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

      // Set idle mouth shape
      if (headMeshRef.current && headMeshRef.current.morphTargetInfluences) {
        const morphDict = headMeshRef.current.morphTargetDictionary || {};
        
        // Reset all morph targets first
        for (let i = 0; i < headMeshRef.current.morphTargetInfluences.length; i++) {
          headMeshRef.current.morphTargetInfluences[i] = 0;
        }
        
        // Apply idle mouth shape
        if (morphDict["mouthOpen"] !== undefined) {
          headMeshRef.current.morphTargetInfluences[morphDict["mouthOpen"]] = IDLE_MOUTH_OPEN;
        }
        if (morphDict["mouthSmile"] !== undefined) {
          headMeshRef.current.morphTargetInfluences[morphDict["mouthSmile"]] = IDLE_MOUTH_SMILE;
        }
      }
      if (teethMeshRef.current && teethMeshRef.current.morphTargetInfluences) {
        const morphDict = teethMeshRef.current.morphTargetDictionary || {};
        
        // Reset all morph targets
        for (let i = 0; i < teethMeshRef.current.morphTargetInfluences.length; i++) {
          teethMeshRef.current.morphTargetInfluences[i] = 0;
        }
        
        // Apply idle mouth shape to teeth mesh as well
        if (morphDict["mouthOpen"] !== undefined) {
          teethMeshRef.current.morphTargetInfluences[morphDict["mouthOpen"]] = IDLE_MOUTH_OPEN * 0.5;
        }
      }
    }

    // Blink animation (applies to both idle and talking)
    // Uses eyesClosed blend shape on head mesh (Oculus LipSync compatible)
    const timeInCycle = currentTime % BLINK_INTERVAL;
    let blinkValue = 0; // 0 = open, 1.0 = closed
    
    if (timeInCycle < BLINK_DURATION) {
      // Blink closing and opening (smooth transition)
      const blinkProgress = timeInCycle / BLINK_DURATION; // 0 to 1
      // Use sine wave: starts at 0 (open), goes to 1 (closed), back to 0 (open)
      blinkValue = Math.sin(blinkProgress * Math.PI);
    }
    
    // Apply blink using eyesClosed morph target on head mesh
    if (headMeshRef.current && headMeshRef.current.morphTargetInfluences) {
      const morphDict = headMeshRef.current.morphTargetDictionary || {};
      
      // Reset eyesClosed first
      if (morphDict["eyesClosed"] !== undefined) {
        headMeshRef.current.morphTargetInfluences[morphDict["eyesClosed"]] = blinkValue;
      } else {
        // Fallback: use scale on eye meshes if eyesClosed morph target doesn't exist
        if (leftEyeMeshRef.current) {
          leftEyeMeshRef.current.scale.set(1, 1.0 - blinkValue, 1);
        }
        if (rightEyeMeshRef.current) {
          rightEyeMeshRef.current.scale.set(1, 1.0 - blinkValue, 1);
        }
      }
    } else {
      // Fallback: use scale on eye meshes if head mesh not found
      if (leftEyeMeshRef.current) {
        leftEyeMeshRef.current.scale.set(1, 1.0 - blinkValue, 1);
      }
      if (rightEyeMeshRef.current) {
        rightEyeMeshRef.current.scale.set(1, 1.0 - blinkValue, 1);
      }
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
      <Canvas camera={{ position: [CAMERA_X, CAMERA_Y, CAMERA_Z], fov: CAMERA_FOV }}>
        <ambientLight intensity={AMBIENT_LIGHT_INTENSITY} />
        <directionalLight position={[10, 10, 5]} intensity={DIRECTIONAL_LIGHT_INTENSITY} />
        <pointLight position={[-10, -10, -5]} intensity={POINT_LIGHT_INTENSITY} />
        <Suspense fallback={null}>
          <AvatarModel isTalking={isTalking} />
        </Suspense>
        <OrbitControls
          enableZoom={ENABLE_ZOOM}
          enablePan={ENABLE_PAN}
          enableRotate={ENABLE_ROTATE}
          minDistance={MIN_DISTANCE}
          maxDistance={MAX_DISTANCE}
          target={[CAMERA_TARGET_X, CAMERA_TARGET_Y, CAMERA_TARGET_Z]}
        />
      </Canvas>
    </div>
  );
}

