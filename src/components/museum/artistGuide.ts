import type { Vector3 } from "three";

export type ArtistGuideRuntime = {
  artistId: string;
  active: boolean;
  phase: "hidden" | "approach" | "idle" | "roam";
  role?: "artist" | "director";
  hold?: boolean;
  position: Vector3;
  target: Vector3;
  speed: number;
  swayPhase: number;
};
