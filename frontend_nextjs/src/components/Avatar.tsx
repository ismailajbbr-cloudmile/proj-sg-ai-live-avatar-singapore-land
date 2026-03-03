"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { Suspense, useRef, useEffect } from "react";
import { Group } from "three";
import type { VisemeFrame } from "@/types/viseme";

useGLTF.preload("/avatar/avatar_1.glb");

// ─── Camera / Display Constants ────────────────────────────────────────────
const CAMERA_X = 0, CAMERA_Y = 0, CAMERA_Z = 0;
const CAMERA_TARGET_X = 0, CAMERA_TARGET_Y = 0, CAMERA_TARGET_Z = -1.2;
const AVATAR_Y_POSITION = -1.5;
const CAMERA_FOV = 50;
const ENABLE_ZOOM = true, ENABLE_PAN = false, ENABLE_ROTATE = true;
const MIN_DISTANCE = 2, MAX_DISTANCE = 6;
const AMBIENT_LIGHT_INTENSITY = 2, DIRECTIONAL_LIGHT_INTENSITY = 2, POINT_LIGHT_INTENSITY = 2;

// ─── Viseme → possible morph target names ───────────────────────────────────
const VISEME_TO_MORPH: Record<string, string[]> = {
  AA: ["viseme_aa", "mouthOpen", "jawOpen"],
  AE: ["viseme_ae", "mouthOpen"],
  AH: ["viseme_ah", "mouthOpen"],
  AO: ["viseme_ao", "mouthOpen"],
  EH: ["viseme_eh", "mouthOpen"],
  ER: ["viseme_er", "mouthOpen"],
  IY: ["viseme_iy", "mouthSmile"],
  UW: ["viseme_uw", "mouthRound"],
  OH: ["viseme_oh", "mouthOpen"],
  FV: ["viseme_fv", "mouthDentalLip"],
  L: ["viseme_l", "mouthOpen"],
  MBP: ["viseme_mbp", "mouthClose"],
  TH: ["viseme_th", "mouthOpen"],
  CH: ["viseme_ch", "mouthOpen"],
  R: ["viseme_r", "mouthOpen"],
  S: ["viseme_s", "mouthOpen"],
  T: ["viseme_t", "mouthOpen"],
  K: ["viseme_k", "mouthOpen"],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }

/** Smoothstep easing: accelerates in, decelerates out — more organic than linear */
function smoothstep(t: number) { return t * t * (3 - 2 * t); }

function sampleViseme(
  visemes: VisemeFrame[],
  playheadMs: number
): { label: string | null; mouth: number } {
  if (!visemes || visemes.length === 0) return { label: null, mouth: 0 };
  if (playheadMs <= visemes[0].t) return { label: visemes[0].label, mouth: visemes[0].mouth ?? 0 };
  const last = visemes[visemes.length - 1];
  if (playheadMs >= last.t) return { label: last.label, mouth: 0 };
  for (let i = 0; i < visemes.length - 1; i++) {
    const a = visemes[i], b = visemes[i + 1];
    if (playheadMs >= a.t && playheadMs < b.t) {
      const span = b.t - a.t || 1;
      // Smoothstep instead of linear — creates organic ease-in/out between phonemes
      const tt = smoothstep(clamp01((playheadMs - a.t) / span));
      return {
        label: tt < 0.5 ? a.label : b.label,
        // Cap at 0.75 — avoids robotic extreme-open jaw positions
        mouth: lerp(a.mouth ?? 0, b.mouth ?? 0, tt) * 0.75,
      };
    }
  }
  return { label: null, mouth: 0 };
}

// ─── Avatar Model ─────────────────────────────────────────────────────────────
interface AvatarModelProps {
  isTalking: boolean;
  visemes?: VisemeFrame[];
  playheadMs?: number;
}

function AvatarModel({ isTalking, visemes = [], playheadMs = 0 }: AvatarModelProps) {
  const LEFT_FOREARM_ROTATION_X = -1.5, LEFT_FOREARM_ROTATION_Y = 0, LEFT_FOREARM_ROTATION_Z = 2.5;
  const LEFT_HAND_ROTATION_X = -0.5, LEFT_HAND_ROTATION_Y = -0.8, LEFT_HAND_ROTATION_Z = -0.1;
  const RIGHT_FOREARM_ROTATION_X = LEFT_FOREARM_ROTATION_X, RIGHT_FOREARM_ROTATION_Y = LEFT_FOREARM_ROTATION_Y, RIGHT_FOREARM_ROTATION_Z = -LEFT_FOREARM_ROTATION_Z;
  const RIGHT_HAND_ROTATION_X = LEFT_HAND_ROTATION_X, RIGHT_HAND_ROTATION_Y = -LEFT_HAND_ROTATION_Y, RIGHT_HAND_ROTATION_Z = -LEFT_HAND_ROTATION_Z;
  const NECK_ROTATION_X = 0.3, NECK_ROTATION_Y = 0, NECK_ROTATION_Z = 0;
  const IDLE_MOUTH_OPEN = 0;
  const IDLE_MOUTH_SMILE = 0.2;
  const BLINK_INTERVAL = 10, BLINK_DURATION = 0.2;

  const { scene, nodes } = useGLTF("/avatar/avatar_1.glb");
  const groupRef = useRef<Group>(null);
  const headRef = useRef<any>(null);
  const neckRef = useRef<any>(null);
  const leftHandRef = useRef<any>(null);
  const rightHandRef = useRef<any>(null);
  const leftForeArmRef = useRef<any>(null);
  const rightForeArmRef = useRef<any>(null);
  const headMeshRef = useRef<any>(null);
  const teethMeshRef = useRef<any>(null);
  const leftEyeMeshRef = useRef<any>(null);
  const rightEyeMeshRef = useRef<any>(null);

  const visemeIndexMap = useRef<Record<string, number>>({});
  // Per-frame damped influence values — we lerp toward targets each frame
  // so the mouth eases in/out instead of snapping between shapes.
  const dampedMorphRef = useRef<Record<number, number>>({});
  // Damped head rotation target — used to smoothly blend between idle and talking motion
  const headRotDampRef = useRef({ x: 0, y: 0, z: 0 });

  useEffect(() => {
    if (!scene || !nodes) return;

    scene.traverse((child: any) => {
      if (child.isMesh && child.morphTargetInfluences) {
        if (child.name === "Wolf3D_Head" && !headMeshRef.current) headMeshRef.current = child;
        if (child.name === "Wolf3D_Teeth" && !teethMeshRef.current) teethMeshRef.current = child;
        if (child.name === "EyeLeft" && !leftEyeMeshRef.current) leftEyeMeshRef.current = child;
        if (child.name === "EyeRight" && !rightEyeMeshRef.current) rightEyeMeshRef.current = child;
      }
      if (child.isBone || child.type === "Bone") {
        const n = child.name || "";
        if (n.toLowerCase() === "head" && !headRef.current) headRef.current = child;
        if (n === "Neck" && !neckRef.current) neckRef.current = child;
        if (n === "LeftHand" && !leftHandRef.current) leftHandRef.current = child;
        if (n === "RightHand" && !rightHandRef.current) rightHandRef.current = child;
        if (n === "LeftForeArm" && !leftForeArmRef.current) leftForeArmRef.current = child;
        if (n === "RightForeArm" && !rightForeArmRef.current) rightForeArmRef.current = child;
      }
    });

    if (!leftEyeMeshRef.current && (nodes as any).EyeLeft) leftEyeMeshRef.current = (nodes as any).EyeLeft;
    if (!rightEyeMeshRef.current && (nodes as any).EyeRight) rightEyeMeshRef.current = (nodes as any).EyeRight;

    if (headMeshRef.current?.morphTargetDictionary) {
      const dict = headMeshRef.current.morphTargetDictionary as Record<string, number>;
      const map: Record<string, number> = {};
      for (const [visLabel, candidates] of Object.entries(VISEME_TO_MORPH)) {
        for (const candidate of candidates) {
          if (dict[candidate] !== undefined) { map[visLabel] = dict[candidate]; break; }
          const found = Object.keys(dict).find((k) => k.toLowerCase() === candidate.toLowerCase());
          if (found !== undefined) { map[visLabel] = dict[found]; break; }
        }
      }
      if (map["AA"] === undefined) {
        for (const k of Object.keys(dict)) {
          if (k.toLowerCase().includes("mouthopen") || k.toLowerCase().includes("jawopen")) {
            map["AA"] = dict[k]; break;
          }
        }
      }
      visemeIndexMap.current = map;
    }
  }, [scene, nodes]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;

    // ── Organic head motion ────────────────────────────────────────────────
    // Technique: sum two or three sine waves at irrational frequency ratios
    // (e.g., 1.0 + 1.618...) so the motion never exactly repeats — it looks
    // organic and slightly different every few seconds, like a real person.
    if (groupRef.current) groupRef.current.position.y = AVATAR_Y_POSITION;
    if (headRef.current) {
      let targetX: number, targetY: number, targetZ: number;

      if (isTalking) {
        // During speech: very subtle micro-movements at different irrational speeds
        // Three layers per axis ensures non-repeating organic feel
        targetX =
          Math.sin(t * 1.10) * 0.012 +  // slow nod
          Math.sin(t * 2.83) * 0.006;   // micro-nod (adds texture)
        targetY =
          Math.sin(t * 0.71) * 0.018 +  // slow look-left/right
          Math.sin(t * 1.97) * 0.008;   // faster micro-shake
        targetZ =
          Math.sin(t * 0.59) * 0.010;   // very slow slight tilt only
      } else {
        // Idle: gentle floating head, also multi-frequency
        targetX = Math.sin(t * 0.20) * 0.05;
        targetY =
          Math.sin(t * 0.30) * 0.10 +
          Math.sin(t * 0.53) * 0.03;
        targetZ =
          Math.sin(t * 0.25) * 0.06 +
          Math.sin(t * 0.47) * 0.02;
      }

      // Damped lerp toward target: HEAD_ROT_DAMP controls speed of transition.
      // Low value = dreamy slow, higher = snappier. 0.06 feels very natural.
      const HEAD_ROT_DAMP = 0.06;
      const dr = headRotDampRef.current;
      dr.x += (targetX - dr.x) * HEAD_ROT_DAMP;
      dr.y += (targetY - dr.y) * HEAD_ROT_DAMP;
      dr.z += (targetZ - dr.z) * HEAD_ROT_DAMP;

      headRef.current.rotation.x = dr.x;
      headRef.current.rotation.y = dr.y;
      headRef.current.rotation.z = dr.z;
      headRef.current.scale.set(1, 1, 1);
    }

    // ── Naturalistic lip sync with per-frame damped morph targets ────────────
    //
    // Technique overview (5 layers of naturalness):
    //   1. smoothstep easing in sampleViseme (not linear)
    //   2. Per-frame damping: influences lerp toward targets (ease in/out)
    //   3. Jaw base layer: mouthOpen always follows phoneme at ~40%
    //   4. Persistent talking smile: humans smile slightly when speaking
    //   5. 0.75 peak cap in sampleViseme: avoids uncanny extreme positions
    //
    if (headMeshRef.current?.morphTargetInfluences) {
      const influ = headMeshRef.current.morphTargetInfluences as number[];
      const dict = headMeshRef.current.morphTargetDictionary as Record<string, number>;

      // Damping: 0.15 = very smooth, 0.30 = snappier. Lower feels more human.
      const DAMP = 0.18;
      // Jaw floor: keeps mouth open a little even during consonants (co-articulation)
      const JAW_BASE = 0.12;
      // Smile layer: subtle constant smile during speech
      const TALKING_SMILE = 0.12;

      // Build target influences for this frame
      const targets: Record<number, number> = {};

      if (isTalking && visemes.length > 0) {
        const { label, mouth } = sampleViseme(visemes, playheadMs);
        const weight = clamp01(mouth);

        // Layer 1: phoneme viseme shape
        if (label && visemeIndexMap.current[label] !== undefined) {
          targets[visemeIndexMap.current[label]] = weight;
        }

        // Layer 2: jaw base — always opens proportionally to phoneme strength
        const mouthOpenIdx = dict["mouthOpen"] ?? dict["jawOpen"];
        if (mouthOpenIdx !== undefined) {
          const existing = targets[mouthOpenIdx] ?? 0;
          targets[mouthOpenIdx] = Math.max(existing, JAW_BASE + weight * 0.38);
        }

        // Layer 3: smile during speech; extra for front-vowels (E, I)
        const smileIdx = dict["mouthSmile"];
        if (smileIdx !== undefined) {
          const smileBoost = (label === "IY" || label === "EH") ? 0.35 : TALKING_SMILE;
          targets[smileIdx] = Math.max(targets[smileIdx] ?? 0, smileBoost);
        }
      } else {
        // Idle: resting gentle smile
        const mouthOpenIdx = dict["mouthOpen"];
        const smileIdx = dict["mouthSmile"];
        if (mouthOpenIdx !== undefined) targets[mouthOpenIdx] = IDLE_MOUTH_OPEN;
        if (smileIdx !== undefined) targets[smileIdx] = IDLE_MOUTH_SMILE;
      }

      // Apply damped influences: lerp current toward target each frame
      const damped = dampedMorphRef.current;
      for (let i = 0; i < influ.length; i++) {
        const target = targets[i] ?? 0;
        const prev = damped[i] ?? 0;
        const next = prev + (target - prev) * DAMP;
        damped[i] = next;
        influ[i] = next;
      }

      // Teeth mesh: follow jaw opening at 60% to show teeth naturally
      if (teethMeshRef.current?.morphTargetInfluences) {
        const tDict = teethMeshRef.current.morphTargetDictionary as Record<string, number>;
        const tInflu = teethMeshRef.current.morphTargetInfluences as number[];
        const mIdx = tDict["mouthOpen"];
        if (mIdx !== undefined) {
          const mouthOpenIdx = dict["mouthOpen"] ?? dict["jawOpen"];
          const jawVal = mouthOpenIdx !== undefined ? (dampedMorphRef.current[mouthOpenIdx] ?? 0) : 0;
          tInflu[mIdx] = jawVal * 0.6;
        }
      }
    }

    // ── Blink ──────────────────────────────────────────────────────────────────
    const timeInCycle = t % BLINK_INTERVAL;
    let blinkValue = 0;
    if (timeInCycle < BLINK_DURATION) {
      blinkValue = Math.sin((timeInCycle / BLINK_DURATION) * Math.PI);
    }
    if (headMeshRef.current?.morphTargetInfluences) {
      const dict = headMeshRef.current.morphTargetDictionary as Record<string, number>;
      if (dict["eyesClosed"] !== undefined) {
        headMeshRef.current.morphTargetInfluences[dict["eyesClosed"]] = blinkValue;
      } else {
        if (leftEyeMeshRef.current) leftEyeMeshRef.current.scale.set(1, 1 - blinkValue, 1);
        if (rightEyeMeshRef.current) rightEyeMeshRef.current.scale.set(1, 1 - blinkValue, 1);
      }
    } else {
      if (leftEyeMeshRef.current) leftEyeMeshRef.current.scale.set(1, 1 - blinkValue, 1);
      if (rightEyeMeshRef.current) rightEyeMeshRef.current.scale.set(1, 1 - blinkValue, 1);
    }

    // ── Neck & arms ──────────────────────────────────────────────────────────
    if (neckRef.current) {
      neckRef.current.rotation.x = NECK_ROTATION_X;
      neckRef.current.rotation.y = NECK_ROTATION_Y;
      neckRef.current.rotation.z = NECK_ROTATION_Z;
    }
    if (leftForeArmRef.current && leftHandRef.current) {
      leftForeArmRef.current.rotation.set(LEFT_FOREARM_ROTATION_X, LEFT_FOREARM_ROTATION_Y, LEFT_FOREARM_ROTATION_Z);
      leftHandRef.current.rotation.set(LEFT_HAND_ROTATION_X, LEFT_HAND_ROTATION_Y, LEFT_HAND_ROTATION_Z);
    }
    if (rightForeArmRef.current && rightHandRef.current) {
      rightForeArmRef.current.rotation.set(RIGHT_FOREARM_ROTATION_X, RIGHT_FOREARM_ROTATION_Y, RIGHT_FOREARM_ROTATION_Z);
      rightHandRef.current.rotation.set(RIGHT_HAND_ROTATION_X, RIGHT_HAND_ROTATION_Y, RIGHT_HAND_ROTATION_Z);
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={scene} scale={1} />
    </group>
  );
}

// ─── Public Component ──────────────────────────────────────────────────────────
interface AvatarProps {
  isTalking?: boolean;
  visemes?: VisemeFrame[];
  playheadMs?: number;
}

export default function Avatar({ isTalking = false, visemes = [], playheadMs = 0 }: AvatarProps) {
  return (
    <div className="h-full w-full bg-[#f8f9fa]">
      <Canvas camera={{ position: [CAMERA_X, CAMERA_Y, CAMERA_Z], fov: CAMERA_FOV }}>
        <ambientLight intensity={AMBIENT_LIGHT_INTENSITY} />
        <directionalLight position={[10, 10, 5]} intensity={DIRECTIONAL_LIGHT_INTENSITY} />
        <pointLight position={[-10, -10, -5]} intensity={POINT_LIGHT_INTENSITY} />
        <Suspense fallback={null}>
          <AvatarModel isTalking={isTalking} visemes={visemes} playheadMs={playheadMs} />
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
