// Fork-only: a fork build of upstream X.Y.Z is versioned X.Y.(Z*1000+100+n) so every
// build updates in place. Runtime downloads must still name the upstream release.
export function upstreamReleaseVersion(version: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (match === null) return version;
  const patch = Number(match[3]);
  return patch < 100 ? version : `${match[1]}.${match[2]}.${Math.floor(patch / 1000)}`;
}
