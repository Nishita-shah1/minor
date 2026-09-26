export const TRUSTMARK_PROFILE = "trustmark-q-lab-v2";
export const DENSE_PROFILE = "densecrop-v1";
export const ISSUED_PROFILE = `${TRUSTMARK_PROFILE}+${DENSE_PROFILE}`;

export type IssuedProfile =
  | { trustmarkProfile: typeof TRUSTMARK_PROFILE; denseProfile: null }
  | { trustmarkProfile: typeof TRUSTMARK_PROFILE; denseProfile: typeof DENSE_PROFILE };

export function parseIssuedProfile(profileId: string): IssuedProfile | null {
  if (profileId === TRUSTMARK_PROFILE) return { trustmarkProfile: TRUSTMARK_PROFILE, denseProfile: null };
  if (profileId === ISSUED_PROFILE) return { trustmarkProfile: TRUSTMARK_PROFILE, denseProfile: DENSE_PROFILE };
  return null;
}
