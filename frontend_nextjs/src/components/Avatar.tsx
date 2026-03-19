"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { Suspense, useRef, useEffect } from "react";
import { Group } from "three";
import type { VisemeFrame, AvatarGesture } from "@/types/viseme";

useGLTF.preload("/avatar/avatar-L7oSo3s2Ds6JI38eWEjN.glb");

// ─── Camera / Display Constants ────────────────────────────────────────────
// Avatar faces +Z. Camera on the +Z side looks at the face.
// Pull back to z=2.8 for a comfortable full-body framing.
// Target y=-0.3 frames the torso centre; avatar y=-1.5 puts head at world ~y=0.2.
const CAMERA_X = 0, CAMERA_Y = 0.2, CAMERA_Z = 2.8;
const CAMERA_TARGET_X = 0, CAMERA_TARGET_Y = -0.3, CAMERA_TARGET_Z = 0;
const AVATAR_Y_POSITION = -1.5;
const CAMERA_FOV = 50;
const ENABLE_ZOOM = true, ENABLE_PAN = false, ENABLE_ROTATE = true;
const MIN_DISTANCE = 1.2, MAX_DISTANCE = 6;
const AMBIENT_LIGHT_INTENSITY = 2, DIRECTIONAL_LIGHT_INTENSITY = 2, POINT_LIGHT_INTENSITY = 2;

// ─── Phoneme → ARKit blend shape combinations ────────────────────────────────
// Each entry maps a TTS phoneme label to weighted ARKit shapes.
// The weight from sampleViseme (0–1) is multiplied by each scale value.
// ARKit available: jawOpen, mouthClose, mouthFunnel, mouthPucker,
//   mouthSmileLeft/Right, mouthFrownLeft/Right, mouthStretchLeft/Right,
//   mouthLowerDownLeft/Right, mouthUpperUpLeft/Right, mouthDimpleLeft/Right,
//   mouthPressLeft/Right, mouthRollLower/Upper, mouthShrugLower/Upper, tongueOut
type ShapeWeight = { name: string; scale: number };
const VISEME_TO_ARKIT: Record<string, ShapeWeight[]> = {
  // Open vowels ──────────────────────────────────────────────────────────────
  AA: [{ name: "jawOpen", scale: 0.9 }, { name: "mouthLowerDownLeft", scale: 0.4 }, { name: "mouthLowerDownRight", scale: 0.4 }],
  AO: [{ name: "jawOpen", scale: 0.7 }, { name: "mouthFunnel", scale: 0.4 }],
  AH: [{ name: "jawOpen", scale: 0.6 }],
  // Mid vowels ───────────────────────────────────────────────────────────────
  AE: [{ name: "jawOpen", scale: 0.6 }, { name: "mouthStretchLeft", scale: 0.3 }, { name: "mouthStretchRight", scale: 0.3 }],
  EH: [{ name: "jawOpen", scale: 0.5 }, { name: "mouthStretchLeft", scale: 0.2 }, { name: "mouthStretchRight", scale: 0.2 }],
  ER: [{ name: "jawOpen", scale: 0.4 }, { name: "mouthFunnel", scale: 0.25 }],
  // Close / smile vowels ─────────────────────────────────────────────────────
  IY: [{ name: "jawOpen", scale: 0.15 }, { name: "mouthSmileLeft", scale: 0.6 }, { name: "mouthSmileRight", scale: 0.6 }],
  // Rounded vowels ───────────────────────────────────────────────────────────
  UW: [{ name: "mouthFunnel", scale: 0.8 }, { name: "mouthPucker", scale: 0.5 }, { name: "jawOpen", scale: 0.15 }],
  OH: [{ name: "jawOpen", scale: 0.5 }, { name: "mouthFunnel", scale: 0.5 }],
  // Bilabial stops (M, B, P) — lips pressed ─────────────────────────────────
  MBP:[{ name: "mouthClose", scale: 0.9 }],
  // Labiodental (F, V) — lower lip under upper teeth ────────────────────────
  FV: [{ name: "mouthLowerDownLeft", scale: 0.4 }, { name: "mouthLowerDownRight", scale: 0.4 }, { name: "jawOpen", scale: 0.1 }],
  // Dental / interdental (TH) ────────────────────────────────────────────────
  TH: [{ name: "jawOpen", scale: 0.25 }, { name: "mouthLowerDownLeft", scale: 0.15 }, { name: "mouthLowerDownRight", scale: 0.15 }],
  // Alveolar stop (T, D) ────────────────────────────────────────────────────
  T:  [{ name: "jawOpen", scale: 0.2 }],
  // Lateral (L) ─────────────────────────────────────────────────────────────
  L:  [{ name: "jawOpen", scale: 0.3 }],
  // Fricative (S, Z) ────────────────────────────────────────────────────────
  S:  [{ name: "jawOpen", scale: 0.12 }],
  // Affricate (CH, J) ───────────────────────────────────────────────────────
  CH: [{ name: "jawOpen", scale: 0.25 }, { name: "mouthFunnel", scale: 0.2 }],
  // Approximant (R) ─────────────────────────────────────────────────────────
  R:  [{ name: "jawOpen", scale: 0.25 }, { name: "mouthFunnel", scale: 0.15 }],
  // Velar stop (K, G) ───────────────────────────────────────────────────────
  K:  [{ name: "jawOpen", scale: 0.4 }],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }
function smoothstep(t: number) { return t * t * (3 - 2 * t); }

function sampleViseme(visemes: VisemeFrame[], playheadMs: number): { label: string | null; mouth: number } {
  if (!visemes || visemes.length === 0) return { label: null, mouth: 0 };
  if (playheadMs <= visemes[0].t) return { label: visemes[0].label, mouth: visemes[0].mouth ?? 0 };
  const last = visemes[visemes.length - 1];
  if (playheadMs >= last.t) return { label: last.label, mouth: 0 };
  for (let i = 0; i < visemes.length - 1; i++) {
    const a = visemes[i], b = visemes[i + 1];
    if (playheadMs >= a.t && playheadMs < b.t) {
      const span = b.t - a.t || 1;
      const tt = smoothstep(clamp01((playheadMs - a.t) / span));
      return {
        label: tt < 0.5 ? a.label : b.label,
        mouth: lerp(a.mouth ?? 0, b.mouth ?? 0, tt) * 0.75,
      };
    }
  }
  return { label: null, mouth: 0 };
}

// ─── Gesture arm poses ────────────────────────────────────────────────────────
// Each tuple is [x, y, z] Euler rotation for: upper arm, forearm, hand
// Left side uses positive Z values, right side mirrors with negative Z.
type ArmPose = {
  la:  readonly [number,number,number]; // LeftArm (upper arm)
  lfa: readonly [number,number,number]; // LeftForeArm
  lh:  readonly [number,number,number]; // LeftHand
  ra:  readonly [number,number,number]; // RightArm
  rfa: readonly [number,number,number]; // RightForeArm
  rh:  readonly [number,number,number]; // RightHand
};

const GESTURE_MOTION: Record<AvatarGesture, {
  head: { x: number; y: number; z: number; duration: number };
  arms: ArmPose;
}> = {
  // Both arms: positive x = arm hangs DOWN, negative x = arm raised UP
  // (confirmed empirically: la.x=+1.4 correct, ra.x=-1.4 was raised)
  // x=+1.4 → arm hangs down; z=+0.2/-0.2 → nudge arms slightly forward (away from hips)
  idle: {
    head: { x: 0, y: 0, z: 0, duration: 0 },
    arms: {
      la:  [+1.4, 0, +0.2], ra:  [+1.4, 0, -0.2],
      lfa: [0,    0, 0    ], rfa: [0,    0, 0    ],
      lh:  [0,    0, 0    ], rh:  [0,    0, 0    ],
    },
  },
  // Nod — arms relaxed at sides
  nod: {
    head: { x: 0.25, y: 0, z: 0, duration: 0.4 },
    arms: {
      la:  [+1.4, 0, +0.2], ra:  [+1.4, 0, -0.2],
      lfa: [0,    0, 0    ], rfa: [0,    0, 0    ],
      lh:  [0,    0, 0    ], rh:  [0,    0, 0    ],
    },
  },
  // Shake — arms slightly open
  shake: {
    head: { x: 0, y: 0.3, z: 0, duration: 0.4 },
    arms: {
      la:  [+0.8, 0, +0.2], ra:  [+0.8, 0, -0.2],
      lfa: [0,    0, 0    ], rfa: [0,    0, 0    ],
      lh:  [0,    0, 0    ], rh:  [0,    0, 0    ],
    },
  },
  // Tilt — thinking: right arm raised toward face, left arm down
  tilt: {
    head: { x: 0, y: 0, z: 0.22, duration: 0.6 },
    arms: {
      la:  [+1.4, 0, +0.2], ra:  [-0.5, 0, -0.2],
      lfa: [0,    0, 0    ], rfa: [0,    0, 0    ],
      lh:  [0,    0, 0    ], rh:  [0,    0, 0    ],
    },
  },
  // Lookup — arms relaxed at sides
  lookup: {
    head: { x: -0.2, y: 0, z: 0, duration: 0.5 },
    arms: {
      la:  [+1.4, 0, +0.2], ra:  [+1.4, 0, -0.2],
      lfa: [0,    0, 0    ], rfa: [0,    0, 0    ],
      lh:  [0,    0, 0    ], rh:  [0,    0, 0    ],
    },
  },
  // Excited — both arms raised up
  excited: {
    head: { x: 0.15, y: 0.1, z: 0.08, duration: 0.3 },
    arms: {
      la:  [-0.5, 0, +0.2], ra:  [-0.5, 0, -0.2],
      lfa: [0,    0, 0    ], rfa: [0,    0, 0    ],
      lh:  [0,    0, 0    ], rh:  [0,    0, 0    ],
    },
  },
};

// ─── Avatar Model ─────────────────────────────────────────────────────────────
interface AvatarModelProps {
  isTalking: boolean;
  visemes?: VisemeFrame[];
  playheadMs?: number;
  gesture?: AvatarGesture;
}

function AvatarModel({ isTalking, visemes = [], playheadMs = 0, gesture = "idle" }: AvatarModelProps) {
  const NECK_ROTATION_X = 0.3;
  const IDLE_MOUTH_OPEN = 0, IDLE_MOUTH_SMILE = 0.2;
  const BLINK_INTERVAL = 10, BLINK_DURATION = 0.2;

  const { scene, nodes } = useGLTF("/avatar/avatar-L7oSo3s2Ds6JI38eWEjN.glb");
  const groupRef         = useRef<Group>(null);
  const headRef          = useRef<any>(null);
  const neckRef          = useRef<any>(null);
  const leftArmRef       = useRef<any>(null);
  const rightArmRef      = useRef<any>(null);
  const leftHandRef      = useRef<any>(null);
  const rightHandRef     = useRef<any>(null);
  const leftForeArmRef   = useRef<any>(null);
  const rightForeArmRef  = useRef<any>(null);
  const headMeshRef      = useRef<any>(null);
  const teethMeshRef     = useRef<any>(null);
  const leftEyeMeshRef   = useRef<any>(null);
  const rightEyeMeshRef  = useRef<any>(null);

  // phoneme → [{idx, scale}] built from ARKit dict in useEffect
  const visemeShapeMap  = useRef<Record<string, Array<{ idx: number; scale: number }>>>({});
  const dampedMorphRef  = useRef<Record<number, number>>({});
  const headRotDampRef  = useRef({ x: 0, y: 0, z: 0 });
  const gestureRef      = useRef<{ gesture: AvatarGesture; startTime: number }>({ gesture: "idle", startTime: 0 });
  const IDLE = GESTURE_MOTION.idle.arms;
  const dampedArmRef = useRef({
    la:  { x: IDLE.la[0],  y: IDLE.la[1],  z: IDLE.la[2]  },
    lfa: { x: IDLE.lfa[0], y: IDLE.lfa[1], z: IDLE.lfa[2] },
    lh:  { x: IDLE.lh[0],  y: IDLE.lh[1],  z: IDLE.lh[2]  },
    ra:  { x: IDLE.ra[0],  y: IDLE.ra[1],  z: IDLE.ra[2]  },
    rfa: { x: IDLE.rfa[0], y: IDLE.rfa[1], z: IDLE.rfa[2] },
    rh:  { x: IDLE.rh[0],  y: IDLE.rh[1],  z: IDLE.rh[2]  },
  });

  useEffect(() => {
    if (!scene || !nodes) return;
    scene.traverse((child: any) => {
      if (child.isMesh && child.morphTargetInfluences) {
        if ((child.name === "Wolf3D_Head" || child.name === "Streamoji_Head") && !headMeshRef.current)   headMeshRef.current  = child;
        if ((child.name === "Wolf3D_Teeth"|| child.name === "Streamoji_Teeth") && !teethMeshRef.current) teethMeshRef.current = child;
        if (child.name === "EyeLeft"      && !leftEyeMeshRef.current)   leftEyeMeshRef.current   = child;
        if (child.name === "EyeRight"     && !rightEyeMeshRef.current)  rightEyeMeshRef.current  = child;
      }
      if (child.isBone || child.type === "Bone") {
        const n = child.name || "";
        if (n.toLowerCase() === "head"  && !headRef.current)         headRef.current         = child;
        if (n === "Neck"                && !neckRef.current)          neckRef.current         = child;
        if (n === "LeftArm"             && !leftArmRef.current)       leftArmRef.current      = child;
        if (n === "RightArm"            && !rightArmRef.current)      rightArmRef.current     = child;
        if (n === "LeftHand"            && !leftHandRef.current)      leftHandRef.current     = child;
        if (n === "RightHand"           && !rightHandRef.current)     rightHandRef.current    = child;
        if (n === "LeftForeArm"         && !leftForeArmRef.current)   leftForeArmRef.current  = child;
        if (n === "RightForeArm"        && !rightForeArmRef.current)  rightForeArmRef.current = child;
      }
    });
    if (!leftEyeMeshRef.current  && (nodes as any).EyeLeft)  leftEyeMeshRef.current  = (nodes as any).EyeLeft;
    if (!rightEyeMeshRef.current && (nodes as any).EyeRight) rightEyeMeshRef.current = (nodes as any).EyeRight;

    if (headMeshRef.current?.morphTargetDictionary) {
      const dict = headMeshRef.current.morphTargetDictionary as Record<string, number>;
      // Build phoneme → [{idx, scale}] from ARKit blend shapes
      const shapeMap: Record<string, Array<{ idx: number; scale: number }>> = {};
      for (const [phoneme, shapes] of Object.entries(VISEME_TO_ARKIT)) {
        const resolved = shapes
          .map(s => ({ idx: dict[s.name], scale: s.scale }))
          .filter(s => s.idx !== undefined) as Array<{ idx: number; scale: number }>;
        if (resolved.length > 0) shapeMap[phoneme] = resolved;
      }
      visemeShapeMap.current = shapeMap;
      const missed = Object.keys(VISEME_TO_ARKIT).filter(p => !shapeMap[p]);
      console.log("[Avatar] ARKit shape map built:", Object.keys(shapeMap).length, "phonemes resolved",
        missed.length ? `| MISSING: ${missed.join(", ")}` : "| all matched ✓");
    }
  }, [scene, nodes]);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;

    if (groupRef.current) groupRef.current.position.y = AVATAR_Y_POSITION;

    // ── Head motion ───────────────────────────────────────────────────────────
    if (headRef.current) {
      if (gesture !== gestureRef.current.gesture) gestureRef.current = { gesture, startTime: t };
      const gm = GESTURE_MOTION[gesture];
      const gh = gm.head;
      const elapsed = t - gestureRef.current.startTime;

      let gesturePulse = 0;
      if (gh.duration > 0) {
        if (isTalking && gesture !== "idle") {
          const phase = elapsed % (gh.duration * 2.5);
          gesturePulse = phase < gh.duration ? Math.sin((phase / gh.duration) * Math.PI) : 0;
        } else {
          gesturePulse = Math.max(0, Math.sin((elapsed / gh.duration) * Math.PI));
        }
      }

      let targetX: number, targetY: number, targetZ: number;
      if (isTalking) {
        targetX = gh.x * gesturePulse + Math.sin(t * 1.10) * 0.012 + Math.sin(t * 2.83) * 0.006;
        targetY = gh.y * gesturePulse + Math.sin(t * 0.71) * 0.018 + Math.sin(t * 1.97) * 0.008;
        targetZ = gh.z * gesturePulse + Math.sin(t * 0.59) * 0.010;
      } else {
        targetX = gh.x * gesturePulse + Math.sin(t * 0.20) * 0.05;
        targetY = gh.y * gesturePulse + Math.sin(t * 0.30) * 0.10 + Math.sin(t * 0.53) * 0.03;
        targetZ = gh.z * gesturePulse + Math.sin(t * 0.25) * 0.06 + Math.sin(t * 0.47) * 0.02;
      }

      const headK = 1 - Math.exp(-4.0 * dt);
      const dr = headRotDampRef.current;
      dr.x += (targetX - dr.x) * headK;
      dr.y += (targetY - dr.y) * headK;
      dr.z += (targetZ - dr.z) * headK;
      headRef.current.rotation.x = dr.x;
      headRef.current.rotation.y = dr.y;
      headRef.current.rotation.z = dr.z;
      headRef.current.scale.set(1, 1, 1);
    }

    // ── Lip sync (ARKit blend shapes) ────────────────────────────────────────
    if (headMeshRef.current?.morphTargetInfluences) {
      const influ = headMeshRef.current.morphTargetInfluences as number[];
      const dict  = headMeshRef.current.morphTargetDictionary  as Record<string, number>;
      const DAMP = 0.18;
      const targets: Record<number, number> = {};

      if (isTalking && visemes.length > 0) {
        const { label, mouth } = sampleViseme(visemes, playheadMs);
        const weight = clamp01(mouth);

        // Apply ARKit shape combination for this phoneme
        if (label) {
          for (const { idx, scale } of visemeShapeMap.current[label] ?? []) {
            targets[idx] = Math.max(targets[idx] ?? 0, weight * scale);
          }
        }
        // Jaw base layer: always open proportionally even during consonants
        const jawIdx = dict["jawOpen"];
        if (jawIdx !== undefined) targets[jawIdx] = Math.max(targets[jawIdx] ?? 0, 0.08 + weight * 0.25);
        // Persistent subtle smile during speech
        const smLIdx = dict["mouthSmileLeft"], smRIdx = dict["mouthSmileRight"];
        if (smLIdx !== undefined) targets[smLIdx] = Math.max(targets[smLIdx] ?? 0, 0.1);
        if (smRIdx !== undefined) targets[smRIdx] = Math.max(targets[smRIdx] ?? 0, 0.1);
      } else {
        // Idle: closed jaw, gentle resting smile
        const jawIdx = dict["jawOpen"];
        if (jawIdx !== undefined) targets[jawIdx] = IDLE_MOUTH_OPEN;
        const smLIdx = dict["mouthSmileLeft"], smRIdx = dict["mouthSmileRight"];
        if (smLIdx !== undefined) targets[smLIdx] = IDLE_MOUTH_SMILE;
        if (smRIdx !== undefined) targets[smRIdx] = IDLE_MOUTH_SMILE;
      }

      // Damped convergence for all morphs
      const damped = dampedMorphRef.current;
      for (let i = 0; i < influ.length; i++) {
        const next = (damped[i] ?? 0) + ((targets[i] ?? 0) - (damped[i] ?? 0)) * DAMP;
        damped[i] = next; influ[i] = next;
      }

      // Teeth: mirror jaw opening from head mesh
      if (teethMeshRef.current?.morphTargetInfluences) {
        const tDict = teethMeshRef.current.morphTargetDictionary as Record<string, number>;
        const jawIdx = dict["jawOpen"];
        const tJawIdx = tDict["jawOpen"];
        if (jawIdx !== undefined && tJawIdx !== undefined) {
          teethMeshRef.current.morphTargetInfluences[tJawIdx] = (dampedMorphRef.current[jawIdx] ?? 0);
        }
      }
    }

    // ── Blink (ARKit eyeBlinkLeft / eyeBlinkRight) ────────────────────────────
    const blinkValue = (t % BLINK_INTERVAL) < BLINK_DURATION
      ? Math.sin(((t % BLINK_INTERVAL) / BLINK_DURATION) * Math.PI) : 0;
    if (headMeshRef.current?.morphTargetInfluences) {
      const dict = headMeshRef.current.morphTargetDictionary as Record<string, number>;
      if (dict["eyeBlinkLeft"]  !== undefined) headMeshRef.current.morphTargetInfluences[dict["eyeBlinkLeft"]]  = blinkValue;
      if (dict["eyeBlinkRight"] !== undefined) headMeshRef.current.morphTargetInfluences[dict["eyeBlinkRight"]] = blinkValue;
    }

    // ── Neck & arms ───────────────────────────────────────────────────────────
    if (neckRef.current) neckRef.current.rotation.x = NECK_ROTATION_X;

    const armK = 1 - Math.exp(-2.0 * dt);
    const ap = GESTURE_MOTION[gesture].arms;
    const da = dampedArmRef.current;
    const lerpTo = (cur: {x:number;y:number;z:number}, tgt: readonly [number,number,number]) => {
      cur.x += (tgt[0] - cur.x) * armK;
      cur.y += (tgt[1] - cur.y) * armK;
      cur.z += (tgt[2] - cur.z) * armK;
    };
    lerpTo(da.la,  ap.la);  lerpTo(da.lfa, ap.lfa); lerpTo(da.lh,  ap.lh);
    lerpTo(da.ra,  ap.ra);  lerpTo(da.rfa, ap.rfa); lerpTo(da.rh,  ap.rh);

    leftArmRef.current?.rotation.set(da.la.x, da.la.y, da.la.z);
    leftForeArmRef.current?.rotation.set(da.lfa.x, da.lfa.y, da.lfa.z);
    leftHandRef.current?.rotation.set(da.lh.x,   da.lh.y,  da.lh.z);
    rightArmRef.current?.rotation.set(da.ra.x, da.ra.y, da.ra.z);
    rightForeArmRef.current?.rotation.set(da.rfa.x, da.rfa.y, da.rfa.z);
    rightHandRef.current?.rotation.set(da.rh.x,   da.rh.y,  da.rh.z);
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
  gesture?: AvatarGesture;
}

export default function Avatar({ isTalking = false, visemes = [], playheadMs = 0, gesture = "idle" }: AvatarProps) {
  return (
    <div className="h-full w-full bg-[#f8f9fa]">
      <Canvas camera={{ position: [CAMERA_X, CAMERA_Y, CAMERA_Z], fov: CAMERA_FOV }}>
        <ambientLight intensity={AMBIENT_LIGHT_INTENSITY} />
        <directionalLight position={[10, 10, 5]} intensity={DIRECTIONAL_LIGHT_INTENSITY} />
        <pointLight position={[-10, -10, -5]} intensity={POINT_LIGHT_INTENSITY} />
        <Suspense fallback={null}>
          <AvatarModel isTalking={isTalking} visemes={visemes} playheadMs={playheadMs} gesture={gesture} />
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
