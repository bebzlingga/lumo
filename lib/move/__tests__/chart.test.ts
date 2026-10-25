import { areaPath, linePath } from "../chart";

/**
 * The curve through a chart's points.
 *
 * One property is worth a test rather than an eye: a smoothed line through
 * daily distance must never leave the band its own two days sit in. The
 * ordinary spline does — through a peak between two rest days it swings below
 * the floor and draws negative kilometres — and monotone cubic was chosen
 * precisely because it cannot. That is the claim these hold to.
 *
 * Plot space, so y grows DOWNWARD: the floor is the largest y, and dipping
 * below a rest day means a y LARGER than the floor.
 */

const FLOOR = 100;

/** Days at the given heights above the floor, evenly spaced. */
function plot(heights: number[]) {
  return heights.map((height, index) => ({ x: index * 40, y: FLOOR - height }));
}

/** Every point the path visits, sampled along its cubic segments. */
function sample(path: string): { x: number; y: number }[] {
  const commands = path.match(/[MC][^MC]*/g) ?? [];
  const points: { x: number; y: number }[] = [];
  let from = { x: 0, y: 0 };

  for (const command of commands) {
    const numbers = (command.slice(1).trim().match(/-?\d+(\.\d+)?(e-?\d+)?/g) ?? []).map(Number);

    if (command[0] === "M") {
      from = { x: numbers[0], y: numbers[1] };
      points.push(from);

      continue;
    }

    const [c1x, c1y, c2x, c2y, x, y] = numbers;

    // Thirty steps a segment is far finer than any overshoot worth seeing.
    for (let step = 1; step <= 30; step += 1) {
      const t = step / 30;
      const inverse = 1 - t;

      points.push({
        x: inverse ** 3 * from.x + 3 * inverse ** 2 * t * c1x + 3 * inverse * t ** 2 * c2x + t ** 3 * x,
        y: inverse ** 3 * from.y + 3 * inverse ** 2 * t * c1y + 3 * inverse * t ** 2 * c2y + t ** 3 * y
      });
    }

    from = { x, y };
  }

  return points;
}

describe("linePath", () => {
  it("draws straight segments when asked for linear", () => {
    expect(linePath(plot([0, 10, 0]), "linear")).toBe("M0 100 L40 90 L80 100");
  });

  it("has nothing to curve with fewer than three points", () => {
    expect(linePath(plot([0, 10]))).toBe("M0 100 L40 90");
    expect(linePath([])).toBe("");
  });

  it("curves — the smoothed path is not the straight one", () => {
    const points = plot([0, 10, 4, 12, 2]);

    expect(linePath(points)).not.toBe(linePath(points, "linear"));
    expect(linePath(points)).toContain("C");
  });

  /**
   * THE ONE THAT MATTERS. A 6 km Saturday between two rest days is where an
   * ordinary spline dips under the floor and draws distance nobody walked.
   */
  it("never dips below the floor around a lone peak", () => {
    for (const point of sample(linePath(plot([0, 0, 60, 0, 0])))) {
      expect(point.y).toBeLessThanOrEqual(FLOOR + 0.001);
    }
  });

  it("never rises above the best day", () => {
    const heights = [0, 12, 60, 8, 30, 0];
    const ceiling = FLOOR - Math.max(...heights);

    for (const point of sample(linePath(plot(heights)))) {
      expect(point.y).toBeGreaterThanOrEqual(ceiling - 0.001);
    }
  });

  /** Two days the same are joined flat, rather than bulging between them. */
  it("holds a flat stretch flat", () => {
    const middle = sample(linePath(plot([0, 20, 20, 20, 4]))).filter((point) => point.x >= 40 && point.x <= 80);

    for (const point of middle) {
      expect(point.y).toBeCloseTo(FLOOR - 20, 6);
    }
  });

  /** Every day's own reading is still drawn exactly where it belongs. */
  it("passes through each day's own value", () => {
    const heights = [0, 14, 3, 22, 9];
    const drawn = sample(linePath(plot(heights)));

    heights.forEach((height, index) => {
      expect(drawn.find((point) => Math.abs(point.x - index * 40) < 0.001)?.y).toBeCloseTo(FLOOR - height, 6);
    });
  });
});

describe("areaPath", () => {
  it("closes the line down to the floor and back", () => {
    const points = plot([0, 10, 0]);

    expect(areaPath(linePath(points, "linear"), points, FLOOR)).toBe("M0 100 L40 90 L80 100 L80 100 L0 100 Z");
  });

  it("has no area without points", () => {
    expect(areaPath("", [], FLOOR)).toBe("");
  });
});
