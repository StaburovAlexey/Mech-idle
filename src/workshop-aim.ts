// A calm scan, a quick acquisition, a short hold, then the same beat in reverse.
const poses = [[0,-.32], [2.7,-.08], [3,.52], [3.55,.52], [6.25,.26], [6.55,-.32], [7.1,-.32]] as const;

export function workshopAim(seconds: number) {
  const time = seconds % poses[poses.length - 1][0];
  const end = poses.findIndex(([t]) => t > time);
  const [fromT,fromAngle] = poses[end - 1], [toT,toAngle] = poses[end];
  const p = (time - fromT) / (toT - fromT);
  return fromAngle + (toAngle - fromAngle) * p * p * (3 - 2 * p);
}
