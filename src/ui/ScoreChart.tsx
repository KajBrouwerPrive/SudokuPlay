// Points of the latest solved games as bars, oldest left. One series, so no legend: the heading
// names it. The best game carries a direct label; every bar shows its value on hover or focus.
import { useState } from "react";
import { formatPoints } from "./format";

const WIDTH = 320;
const HEIGHT = 120;
/** Room above the bars for the value label. */
const TOP_PADDING = 18;
const BAR_GAP = 2;
const CORNER_RADIUS = 4;
/** Hover targets span the full column height, larger than the bar itself. */
const MIN_BAR_HEIGHT = 2;

interface ScoreChartProps {
  scores: number[];
}

/** A bar with rounded top corners and a square foot on the baseline. */
function barPath(x: number, y: number, width: number, height: number): string {
  const radius = Math.min(CORNER_RADIUS, width / 2, height);
  return [
    `M${x},${y + height}`,
    `V${y + radius}`,
    `Q${x},${y} ${x + radius},${y}`,
    `H${x + width - radius}`,
    `Q${x + width},${y} ${x + width},${y + radius}`,
    `V${y + height}`,
    "Z",
  ].join(" ");
}

export function ScoreChart({ scores }: ScoreChartProps) {
  const [active, setActive] = useState<number | null>(null);
  if (scores.length === 0) return null;
  const best = Math.max(...scores);
  const bestIndex = scores.lastIndexOf(best);
  const column = WIDTH / scores.length;
  const barWidth = column - BAR_GAP;
  const scale = (HEIGHT - TOP_PADDING) / Math.max(best, 1);
  const labelled = active ?? bestIndex;

  return (
    <svg className="score-chart" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`Punten van de laatste ${scores.length} opgeloste puzzels`}>
      <line className="score-chart__baseline" x1={0} x2={WIDTH} y1={HEIGHT - 0.5} y2={HEIGHT - 0.5} />
      {scores.map((score, index) => {
        const height = Math.max(score * scale, MIN_BAR_HEIGHT);
        const x = index * column + BAR_GAP / 2;
        return (
          <g
            key={index}
            className={index === labelled ? "score-chart__bar score-chart__bar--active" : "score-chart__bar"}
            tabIndex={0}
            onMouseEnter={() => setActive(index)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(index)}
            onBlur={() => setActive(null)}
          >
            <title>{`${formatPoints(score)} punten`}</title>
            <rect className="score-chart__hit" x={index * column} y={0} width={column} height={HEIGHT} />
            <path d={barPath(x, HEIGHT - height, barWidth, height)} />
          </g>
        );
      })}
      <text
        className="score-chart__label"
        x={Math.min(Math.max(labelled * column + column / 2, 16), WIDTH - 16)}
        y={HEIGHT - Math.max(scores[labelled] * scale, MIN_BAR_HEIGHT) - 5}
        textAnchor="middle"
      >
        {formatPoints(scores[labelled])}
      </text>
    </svg>
  );
}
