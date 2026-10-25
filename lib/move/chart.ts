/**
 * The geometry a chart is drawn from.
 *
 * Pure, and out here rather than in the component for the reason everything
 * tested in this app is: a path builder is arithmetic, arithmetic is where the
 * mistakes are, and a mistake in this one draws distance nobody walked. The
 * component owns pixels, colour and layout; this owns the line.
 */

export type ChartPoint = { x: number; y: number };

export type ChartCurve = "smooth" | "linear";

/**
 * The path through the points, in plot space.
 *
 * ## The curve is MONOTONE cubic, and the choice is not cosmetic
 *
 * Straight segments were the original answer, for a reason worth keeping in
 * view: a smoothed line through daily readings invents distance on the days
 * between them. The ordinary smoothing everyone reaches for — Catmull-Rom, or a
 * "natural" spline — is worse than inexact here, it is wrong in a specific
 * direction: fitted through a 6 km Saturday sitting between two rest days, it
 * swings BELOW the floor either side of the peak and draws negative kilometres,
 * which is not a thing that can happen.
 *
 * Monotone cubic (Fritsch–Carlson) is the curve that cannot do that. Between
 * any two days the line is bounded by those two days' own values, so a rest day
 * stays on the floor, a peak stays the peak, and nothing between two equal days
 * bulges. What it buys is a shape that reads as a trend rather than as a saw,
 * which is what the chart is for; what it costs is that Tuesday-to-Wednesday is
 * drawn as a slope rather than as the step it really was. Every VALUE on the
 * chart is still exactly a day's own reading — only the joins are interpolated.
 *
 * `linear` remains, for a caller that wants the steps back.
 */
export function linePath(points: ChartPoint[], curve: ChartCurve = "smooth"): string {
  if (points.length === 0) {
    return "";
  }

  // Two points make a straight line whichever curve is asked for; a cubic needs
  // a third to have anything to be curved by.
  if (curve === "linear" || points.length < 3) {
    return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
  }

  const tangents = monotoneTangents(points);
  let path = `M${points[0].x} ${points[0].y}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    // A third of the way along, which is what makes the Bézier's slope at each
    // end equal the tangent worked out for that point.
    const third = (to.x - from.x) / 3;

    path += ` C${from.x + third} ${from.y + tangents[index] * third} ${to.x - third} ${to.y - tangents[index + 1] * third} ${to.x} ${to.y}`;
  }

  return path;
}

/**
 * The slope to leave each point at, chosen so the curve never overshoots.
 *
 * Fritsch–Carlson, in two passes. The first takes the average of the slopes
 * either side, and flattens any point that is a turn — a peak or a trough gets
 * a horizontal tangent, which is what stops the curve carrying on past it. The
 * second limits what is left: where a tangent is steep enough relative to the
 * segment it belongs to that the cubic would leave the band between its two
 * endpoints, both ends are scaled back onto the circle of radius 3 that bounds
 * the safe region.
 */
function monotoneTangents(points: ChartPoint[]): number[] {
  const count = points.length;
  const slopes: number[] = [];

  for (let index = 0; index < count - 1; index += 1) {
    const run = points[index + 1].x - points[index].x;

    slopes[index] = run === 0 ? 0 : (points[index + 1].y - points[index].y) / run;
  }

  const tangents: number[] = new Array(count);

  tangents[0] = slopes[0];
  tangents[count - 1] = slopes[count - 2];

  for (let index = 1; index < count - 1; index += 1) {
    // Opposite signs either side means this point is a turn, and a turn is flat.
    tangents[index] = slopes[index - 1] * slopes[index] <= 0 ? 0 : (slopes[index - 1] + slopes[index]) / 2;
  }

  for (let index = 0; index < count - 1; index += 1) {
    if (slopes[index] === 0) {
      // A flat segment — two days the same — is drawn flat at both ends, so
      // nothing bulges between a pair of rest days.
      tangents[index] = 0;
      tangents[index + 1] = 0;

      continue;
    }

    const start = tangents[index] / slopes[index];
    const end = tangents[index + 1] / slopes[index];
    const magnitude = start * start + end * end;

    if (magnitude > 9) {
      const scale = 3 / Math.sqrt(magnitude);

      tangents[index] = scale * start * slopes[index];
      tangents[index + 1] = scale * end * slopes[index];
    }
  }

  return tangents;
}

/**
 * The same path closed down to a floor and back — the wash under a line.
 *
 * Takes the line rather than rebuilding it, so the area can never be drawn from
 * a different curve than the line sitting on top of it.
 */
export function areaPath(line: string, points: ChartPoint[], floor: number): string {
  if (points.length === 0) {
    return "";
  }

  return `${line} L${points[points.length - 1].x} ${floor} L${points[0].x} ${floor} Z`;
}
