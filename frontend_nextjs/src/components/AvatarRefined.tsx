"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { Suspense, useRef, useEffect } from "react";
import { Group, Bone, Mesh, Object3D } from "three";

// Preload the model for better performance
useGLTF.preload("/avatar/avatar_1.glb");

// ============================================================================
// CONFIGURATION CONSTANTS
// ============================================================================

// Camera settings
const CAMERA_POSITION = [0, 0, 0] as const;
const CAMERA_TARGET = [0, 0, -1.2] as const;
const CAMERA_FOV = 50;

// Camera controls
const ENABLE_ZOOM = true;
const ENABLE_PAN = false;
const ENABLE_ROTATE = true;
const MIN_DISTANCE = 2;
const MAX_DISTANCE = 6;

// Lighting
const AMBIENT_LIGHT_INTENSITY = 2;
const DIRECTIONAL_LIGHT_INTENSITY = 2;
const POINT_LIGHT_INTENSITY = 2;

// Avatar position
const AVATAR_Y_POSITION = -1.5;


// Animation constants
const LEFT_FOREARM_ROTATION = { x: -1.5, y: 0, z: 2.5 };
const LEFT_HAND_ROTATION = { x: -0.5, y: -0.8, z: -0.1 };
const RIGHT_FOREARM_ROTATION = { x: LEFT_FOREARM_ROTATION.x, y: LEFT_FOREARM_ROTATION.y, z: -LEFT_FOREARM_ROTATION.z };
const RIGHT_HAND_ROTATION = { x: LEFT_HAND_ROTATION.x, y: -LEFT_HAND_ROTATION.y, z: -LEFT_HAND_ROTATION.z };
const NECK_ROTATION = { x: 0.3, y: 0, z: 0 };

const IDLE_MOUTH_OPEN = 0;
const IDLE_MOUTH_SMILE = 0.2;
const MOUTH_INTENSITY = 3;
const MOUTH_SPEED = 3;

const CUSTOM_VISEMES = [
  { name: "silence", open: 0.0, smile: 0.0 },
  { name: "closed", open: 0.1, smile: 0.0 },
  { name: "narrow", open: 0.3, smile: 0.2 },
  { name: "wide", open: 0.8, smile: 0.1 },
  { name: "smile_open", open: 0.6, smile: 0.7 },
  { name: "open", open: 0.7, smile: 0.0 },
  { name: "smile", open: 0.2, smile: 0.8 },
  { name: "narrow_open", open: 0.5, smile: 0.1 },
  { name: "wide_smile", open: 0.4, smile: 0.9 },
  { name: "round", open: 0.6, smile: 0.0 },
] as const;

const TALKING_HEAD_AMPLITUDE = { nod: 0.04, shake: 0.04, tilt: 0.03 };
const TALKING_HEAD_SPEED = { nod: 2.5, shake: 2.5, tilt: 2.5 };
const IDLE_HEAD_SPEED = { y: 0.3, z: 0.25, x: 0.2 };
const IDLE_HEAD_AMPLITUDE = { y: 0.12, z: 0.08, x: 0.05 };

const BLINK_INTERVAL = 10;
const BLINK_DURATION = 0.2;
const TEETH_MOUTH_OPEN_MULTIPLIER = 0.5;

interface AvatarModelProps {
  isTalking: boolean;
}

interface MeshWithMorphTargets extends Mesh {
  morphTargetInfluences?: number[];
  morphTargetDictionary?: Record<string, number>;
}

function AvatarModel({ isTalking }: AvatarModelProps) {
  const { scene, nodes } = useGLTF("/avatar/avatar_1.glb");
  const groupRef = useRef<Group>(null);
  const headRef = useRef<Bone | null>(null);
  const neckRef = useRef<Bone | null>(null);
  const leftHandRef = useRef<Bone | null>(null);
  const rightHandRef = useRef<Bone | null>(null);
  const leftForeArmRef = useRef<Bone | null>(null);
  const rightForeArmRef = useRef<Bone | null>(null);
  const headMeshRef = useRef<MeshWithMorphTargets | null>(null);
  const teethMeshRef = useRef<MeshWithMorphTargets | null>(null);
  const leftEyeMeshRef = useRef<Mesh | null>(null);
  const rightEyeMeshRef = useRef<Mesh | null>(null);

  // Initialize bone and mesh references
  useEffect(() => {
    if (!scene || !nodes) return;

    scene.traverse((child: Object3D) => {
      const childType = (child as any).type || "";
      const isBone = (child as any).isBone || childType === "Bone";
      const isMesh = (child as any).isMesh || childType.includes("Mesh");

      if (isBone) {
        const name = child.name || "";
        const nameLower = name.toLowerCase();
        
        if (nameLower === "head" && !headRef.current) {
          headRef.current = child as Bone;
        } else if (name === "Neck" && !neckRef.current) {
          neckRef.current = child as Bone;
        } else if (name === "LeftHand" && !leftHandRef.current) {
          leftHandRef.current = child as Bone;
        } else if (name === "RightHand" && !rightHandRef.current) {
          rightHandRef.current = child as Bone;
        } else if (name === "LeftForeArm" && !leftForeArmRef.current) {
          leftForeArmRef.current = child as Bone;
        } else if (name === "RightForeArm" && !rightForeArmRef.current) {
          rightForeArmRef.current = child as Bone;
        }
      }

      if (isMesh) {
        const mesh = child as MeshWithMorphTargets;
        
        if (mesh.morphTargetInfluences) {
          if (child.name === "Wolf3D_Head" && !headMeshRef.current) {
            headMeshRef.current = mesh;
          } else if (child.name === "Wolf3D_Teeth" && !teethMeshRef.current) {
            teethMeshRef.current = mesh;
          } else if (child.name === "EyeLeft" && !leftEyeMeshRef.current) {
            leftEyeMeshRef.current = mesh;
          } else if (child.name === "EyeRight" && !rightEyeMeshRef.current) {
            rightEyeMeshRef.current = mesh;
          }
        }
      }
    });

    // Fallback: find eye meshes from nodes directly
    if (!leftEyeMeshRef.current && nodes.EyeLeft) {
      leftEyeMeshRef.current = nodes.EyeLeft as Mesh;
    }
    if (!rightEyeMeshRef.current && nodes.EyeRight) {
      rightEyeMeshRef.current = nodes.EyeRight as Mesh;
    }
  }, [scene, nodes]);

  // Helper functions
  const resetMorphTargets = (mesh: MeshWithMorphTargets) => {
    if (mesh.morphTargetInfluences) {
      for (let i = 0; i < mesh.morphTargetInfluences.length; i++) {
        mesh.morphTargetInfluences[i] = 0;
      }
    }
  };

  const applyMorphTarget = (mesh: MeshWithMorphTargets, name: string, value: number) => {
    const morphDict = mesh.morphTargetDictionary;
    if (morphDict && morphDict[name] !== undefined && mesh.morphTargetInfluences) {
      mesh.morphTargetInfluences[morphDict[name]] = Math.max(0, Math.min(1, value));
    }
  };

  const setGroupDefaults = () => {
    if (groupRef.current) {
      groupRef.current.position.y = AVATAR_Y_POSITION;
      groupRef.current.scale.set(1, 1, 1);
    }
  };

  const animateTalkingHead = (time: number) => {
    if (headRef.current) {
      headRef.current.rotation.x = Math.sin(time * TALKING_HEAD_SPEED.nod) * TALKING_HEAD_AMPLITUDE.nod;
      headRef.current.rotation.y = Math.sin(time * TALKING_HEAD_SPEED.shake) * TALKING_HEAD_AMPLITUDE.shake;
      headRef.current.rotation.z = Math.sin(time * TALKING_HEAD_SPEED.tilt) * TALKING_HEAD_AMPLITUDE.tilt;
      headRef.current.scale.set(1, 1, 1);
    } else if (groupRef.current) {
      groupRef.current.rotation.x = Math.sin(time * TALKING_HEAD_SPEED.nod) * TALKING_HEAD_AMPLITUDE.nod * 1.5;
      groupRef.current.rotation.y = Math.sin(time * TALKING_HEAD_SPEED.shake) * TALKING_HEAD_AMPLITUDE.shake * 1.5;
    }
  };

  const animateIdleHead = (time: number) => {
    if (headRef.current) {
      headRef.current.rotation.y = Math.sin(time * IDLE_HEAD_SPEED.y) * IDLE_HEAD_AMPLITUDE.y;
      headRef.current.rotation.z = Math.sin(time * IDLE_HEAD_SPEED.z) * IDLE_HEAD_AMPLITUDE.z;
      headRef.current.rotation.x = Math.sin(time * IDLE_HEAD_SPEED.x) * IDLE_HEAD_AMPLITUDE.x;
      headRef.current.scale.set(1, 1, 1);
    }
  };

  const animateTalkingMouth = (time: number) => {
    if (!headMeshRef.current?.morphTargetInfluences) return;

    resetMorphTargets(headMeshRef.current);

    const cycleTime = time * MOUTH_SPEED;
    const visemeIndex = Math.floor(cycleTime) % CUSTOM_VISEMES.length;
    const nextVisemeIndex = (visemeIndex + 1) % CUSTOM_VISEMES.length;
    const blendFactor = cycleTime % 1;

    const currentViseme = CUSTOM_VISEMES[visemeIndex];
    const nextViseme = CUSTOM_VISEMES[nextVisemeIndex];

    const mouthOpen = (currentViseme.open * (1 - blendFactor) + nextViseme.open * blendFactor) * MOUTH_INTENSITY;
    const mouthSmile = (currentViseme.smile * (1 - blendFactor) + nextViseme.smile * blendFactor) * MOUTH_INTENSITY;

    applyMorphTarget(headMeshRef.current, "mouthOpen", mouthOpen);
    applyMorphTarget(headMeshRef.current, "mouthSmile", mouthSmile);

    if (teethMeshRef.current?.morphTargetInfluences) {
      resetMorphTargets(teethMeshRef.current);
      const teethMouthOpen = Math.abs(Math.sin(time * MOUTH_SPEED * 2)) * MOUTH_INTENSITY;
      applyMorphTarget(teethMeshRef.current, "mouthOpen", teethMouthOpen * TEETH_MOUTH_OPEN_MULTIPLIER);
    }
  };

  const setIdleMouth = () => {
    if (headMeshRef.current?.morphTargetInfluences) {
      resetMorphTargets(headMeshRef.current);
      applyMorphTarget(headMeshRef.current, "mouthOpen", IDLE_MOUTH_OPEN);
      applyMorphTarget(headMeshRef.current, "mouthSmile", IDLE_MOUTH_SMILE);
    }

    if (teethMeshRef.current?.morphTargetInfluences) {
      resetMorphTargets(teethMeshRef.current);
      applyMorphTarget(teethMeshRef.current, "mouthOpen", IDLE_MOUTH_OPEN * TEETH_MOUTH_OPEN_MULTIPLIER);
    }
  };

  const animateBlink = (time: number) => {
    const timeInCycle = time % BLINK_INTERVAL;
    const blinkValue = timeInCycle < BLINK_DURATION
      ? Math.sin((timeInCycle / BLINK_DURATION) * Math.PI)
      : 0;

    if (headMeshRef.current?.morphTargetInfluences) {
      const morphDict = headMeshRef.current.morphTargetDictionary;
      if (morphDict && morphDict["eyesClosed"] !== undefined) {
        headMeshRef.current.morphTargetInfluences[morphDict["eyesClosed"]] = blinkValue;
        return;
      }
    }

    // Fallback: use scale on eye meshes
    const eyeScale = 1.0 - blinkValue;
    if (leftEyeMeshRef.current) {
      leftEyeMeshRef.current.scale.set(1, eyeScale, 1);
    }
    if (rightEyeMeshRef.current) {
      rightEyeMeshRef.current.scale.set(1, eyeScale, 1);
    }
  };

  const setNeckPosition = () => {
    if (neckRef.current) {
      neckRef.current.rotation.set(NECK_ROTATION.x, NECK_ROTATION.y, NECK_ROTATION.z);
    }
  };

  const setHandPositions = () => {
    if (leftForeArmRef.current && leftHandRef.current) {
      leftForeArmRef.current.rotation.set(
        LEFT_FOREARM_ROTATION.x,
        LEFT_FOREARM_ROTATION.y,
        LEFT_FOREARM_ROTATION.z
      );
      leftHandRef.current.rotation.set(
        LEFT_HAND_ROTATION.x,
        LEFT_HAND_ROTATION.y,
        LEFT_HAND_ROTATION.z
      );
    }

    if (rightForeArmRef.current && rightHandRef.current) {
      rightForeArmRef.current.rotation.set(
        RIGHT_FOREARM_ROTATION.x,
        RIGHT_FOREARM_ROTATION.y,
        RIGHT_FOREARM_ROTATION.z
      );
      rightHandRef.current.rotation.set(
        RIGHT_HAND_ROTATION.x,
        RIGHT_HAND_ROTATION.y,
        RIGHT_HAND_ROTATION.z
      );
    }
  };

  // Main animation loop
  useFrame((state) => {
    const currentTime = state.clock.elapsedTime;

    setGroupDefaults();
    setNeckPosition();
    setHandPositions();
    animateBlink(currentTime);

    if (isTalking) {
      animateTalkingHead(currentTime);
      animateTalkingMouth(currentTime);
    } else {
      if (groupRef.current) {
        groupRef.current.rotation.set(0, 0, 0);
      }
      animateIdleHead(currentTime);
      setIdleMouth();
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
      <Canvas camera={{ position: CAMERA_POSITION, fov: CAMERA_FOV }}>
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
          target={CAMERA_TARGET}
        />
      </Canvas>
    </div>
  );
}

