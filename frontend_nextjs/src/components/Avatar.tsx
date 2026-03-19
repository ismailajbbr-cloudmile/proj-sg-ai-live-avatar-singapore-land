"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { Suspense, useRef, useEffect } from "react";
import { Group } from "three";
import type { VisemeFrame, AvatarGesture } from "@/types/viseme";

useGLTF.preload("/avatar/avatar_1.glb");

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
  L:  ["viseme_l",  "mouthOpen"],
  MBP:["viseme_mbp","mouthClose"],
  TH: ["viseme_th", "mouthOpen"],
  CH: ["viseme_ch", "mouthOpen"],
  R:  ["viseme_r",  "mouthOpen"],
  S:  ["viseme_s",  "mouthOpen"],
  T:  ["viseme_t",  "mouthOpen"],
  K:  ["viseme_k",  "mouthOpen"],
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
// feat/demo forearm Z=±2.5 works with the close-in camera (arms fold naturally
// in front of the body). Mirror Z for right side.
const LEFT_FA  = [-1.5, 0, 2.5]  as const;
const LEFT_H   = [-0.5,-0.8,-0.1] as const;
const RIGHT_FA = [-1.5, 0,-2.5]  as const;
const RIGHT_H  = [-0.5, 0.8, 0.1] as const;

const GESTURE_MOTION: Record<AvatarGesture, {
  head: { x: number; y: number; z: number; duration: number };
  lfa: readonly [number,number,number]; lh: readonly [number,number,number];
  rfa: readonly [number,number,number]; rh: readonly [number,number,number];
}> = {
  idle:    { head: { x:0, y:0, z:0, duration:0 },      lfa:LEFT_FA,  lh:LEFT_H,   rfa:RIGHT_FA, rh:RIGHT_H },
  nod:     { head: { x:0.25,y:0,z:0,duration:0.4 },    lfa:LEFT_FA,  lh:LEFT_H,   rfa:RIGHT_FA, rh:RIGHT_H },
  shake:   { head: { x:0,y:0.3,z:0,duration:0.4 },     lfa:LEFT_FA,  lh:LEFT_H,   rfa:RIGHT_FA, rh:RIGHT_H },
  tilt:    { head: { x:0,y:0,z:0.22,duration:0.6 },    lfa:LEFT_FA,  lh:LEFT_H,   rfa:RIGHT_FA, rh:RIGHT_H },
  lookup:  { head: { x:-0.2,y:0,z:0,duration:0.5 },    lfa:LEFT_FA,  lh:LEFT_H,   rfa:RIGHT_FA, rh:RIGHT_H },
  excited: { head: { x:0.15,y:0.1,z:0.08,duration:0.3},lfa:LEFT_FA,  lh:LEFT_H,   rfa:RIGHT_FA, rh:RIGHT_H },
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

  const { scene, nodes } = useGLTF("/avatar/avatar_1.glb");
  const groupRef         = useRef<Group>(null);
  const headRef          = useRef<any>(null);
  const neckRef          = useRef<any>(null);
  const leftHandRef      = useRef<any>(null);
  const rightHandRef     = useRef<any>(null);
  const leftForeArmRef   = useRef<any>(null);
  const rightForeArmRef  = useRef<any>(null);
  const headMeshRef      = useRef<any>(null);
  const teethMeshRef     = useRef<any>(null);
  const leftEyeMeshRef   = useRef<any>(null);
  const rightEyeMeshRef  = useRef<any>(null);

  const visemeIndexMap  = useRef<Record<string, number>>({});
  const dampedMorphRef  = useRef<Record<number, number>>({});
  const headRotDampRef  = useRef({ x: 0, y: 0, z: 0 });
  const gestureRef      = useRef<{ gesture: AvatarGesture; startTime: number }>({ gesture: "idle", startTime: 0 });
  const dampedArmRef    = useRef({
    lfa: { x: LEFT_FA[0],  y: LEFT_FA[1],  z: LEFT_FA[2]  },
    lh:  { x: LEFT_H[0],   y: LEFT_H[1],   z: LEFT_H[2]   },
    rfa: { x: RIGHT_FA[0], y: RIGHT_FA[1], z: RIGHT_FA[2] },
    rh:  { x: RIGHT_H[0],  y: RIGHT_H[1],  z: RIGHT_H[2]  },
  });

  useEffect(() => {
    if (!scene || !nodes) return;
    scene.traverse((child: any) => {
      if (child.isMesh && child.morphTargetInfluences) {
        if (child.name === "Wolf3D_Head"  && !headMeshRef.current)      headMeshRef.current      = child;
        if (child.name === "Wolf3D_Teeth" && !teethMeshRef.current)     teethMeshRef.current     = child;
        if (child.name === "EyeLeft"      && !leftEyeMeshRef.current)   leftEyeMeshRef.current   = child;
        if (child.name === "EyeRight"     && !rightEyeMeshRef.current)  rightEyeMeshRef.current  = child;
      }
      if (child.isBone || child.type === "Bone") {
        const n = child.name || "";
        if (n.toLowerCase() === "head"  && !headRef.current)         headRef.current         = child;
        if (n === "Neck"                && !neckRef.current)          neckRef.current         = child;
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
      const map: Record<string, number> = {};
      for (const [visLabel, candidates] of Object.entries(VISEME_TO_MORPH)) {
        for (const candidate of candidates) {
          if (dict[candidate] !== undefined) { map[visLabel] = dict[candidate]; break; }
          const found = Object.keys(dict).find(k => k.toLowerCase() === candidate.toLowerCase());
          if (found !== undefined) { map[visLabel] = dict[found]; break; }
        }
      }
      if (map["AA"] === undefined) {
        for (const k of Object.keys(dict)) {
          if (k.toLowerCase().includes("mouthopen") || k.toLowerCase().includes("jawopen")) { map["AA"] = dict[k]; break; }
        }
      }
      visemeIndexMap.current = map;
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

    // ── Lip sync ──────────────────────────────────────────────────────────────
    if (headMeshRef.current?.morphTargetInfluences) {
      const influ = headMeshRef.current.morphTargetInfluences as number[];
      const dict  = headMeshRef.current.morphTargetDictionary  as Record<string, number>;
      const DAMP = 0.18, JAW_BASE = 0.12, TALKING_SMILE = 0.12;
      const targets: Record<number, number> = {};

      if (isTalking && visemes.length > 0) {
        const { label, mouth } = sampleViseme(visemes, playheadMs);
        const weight = clamp01(mouth);
        if (label && visemeIndexMap.current[label] !== undefined) targets[visemeIndexMap.current[label]] = weight;
        const mIdx = dict["mouthOpen"] ?? dict["jawOpen"];
        if (mIdx !== undefined) targets[mIdx] = Math.max(targets[mIdx] ?? 0, JAW_BASE + weight * 0.38);
        const sIdx = dict["mouthSmile"];
        if (sIdx !== undefined) targets[sIdx] = Math.max(targets[sIdx] ?? 0, (label === "IY" || label === "EH") ? 0.35 : TALKING_SMILE);
      } else {
        if (dict["mouthOpen"]  !== undefined) targets[dict["mouthOpen"]]  = IDLE_MOUTH_OPEN;
        if (dict["mouthSmile"] !== undefined) targets[dict["mouthSmile"]] = IDLE_MOUTH_SMILE;
      }

      const damped = dampedMorphRef.current;
      for (let i = 0; i < influ.length; i++) {
        const next = (damped[i] ?? 0) + ((targets[i] ?? 0) - (damped[i] ?? 0)) * DAMP;
        damped[i] = next; influ[i] = next;
      }

      if (teethMeshRef.current?.morphTargetInfluences) {
        const tDict = teethMeshRef.current.morphTargetDictionary as Record<string, number>;
        const mIdx = tDict["mouthOpen"];
        if (mIdx !== undefined) {
          const jawIdx = dict["mouthOpen"] ?? dict["jawOpen"];
          teethMeshRef.current.morphTargetInfluences[mIdx] = jawIdx !== undefined ? (dampedMorphRef.current[jawIdx] ?? 0) * 0.6 : 0;
        }
      }
    }

    // ── Blink ─────────────────────────────────────────────────────────────────
    const blinkValue = (t % BLINK_INTERVAL) < BLINK_DURATION
      ? Math.sin(((t % BLINK_INTERVAL) / BLINK_DURATION) * Math.PI) : 0;
    if (headMeshRef.current?.morphTargetInfluences) {
      const dict = headMeshRef.current.morphTargetDictionary as Record<string, number>;
      if (dict["eyesClosed"] !== undefined) headMeshRef.current.morphTargetInfluences[dict["eyesClosed"]] = blinkValue;
      else {
        leftEyeMeshRef.current?.scale.set(1, 1 - blinkValue, 1);
        rightEyeMeshRef.current?.scale.set(1, 1 - blinkValue, 1);
      }
    } else {
      leftEyeMeshRef.current?.scale.set(1, 1 - blinkValue, 1);
      rightEyeMeshRef.current?.scale.set(1, 1 - blinkValue, 1);
    }

    // ── Neck & arms ───────────────────────────────────────────────────────────
    if (neckRef.current) neckRef.current.rotation.x = NECK_ROTATION_X;

    const armK = 1 - Math.exp(-2.0 * dt);
    const gm = GESTURE_MOTION[gesture];
    const da = dampedArmRef.current;
    da.lfa.x += (gm.lfa[0] - da.lfa.x) * armK; da.lfa.y += (gm.lfa[1] - da.lfa.y) * armK; da.lfa.z += (gm.lfa[2] - da.lfa.z) * armK;
    da.lh.x  += (gm.lh[0]  - da.lh.x)  * armK; da.lh.y  += (gm.lh[1]  - da.lh.y)  * armK; da.lh.z  += (gm.lh[2]  - da.lh.z)  * armK;
    da.rfa.x += (gm.rfa[0] - da.rfa.x) * armK; da.rfa.y += (gm.rfa[1] - da.rfa.y) * armK; da.rfa.z += (gm.rfa[2] - da.rfa.z) * armK;
    da.rh.x  += (gm.rh[0]  - da.rh.x)  * armK; da.rh.y  += (gm.rh[1]  - da.rh.y)  * armK; da.rh.z  += (gm.rh[2]  - da.rh.z)  * armK;

    leftForeArmRef.current?.rotation.set(da.lfa.x, da.lfa.y, da.lfa.z);
    leftHandRef.current?.rotation.set(da.lh.x, da.lh.y, da.lh.z);
    rightForeArmRef.current?.rotation.set(da.rfa.x, da.rfa.y, da.rfa.z);
    rightHandRef.current?.rotation.set(da.rh.x, da.rh.y, da.rh.z);
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
