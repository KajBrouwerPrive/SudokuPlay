// Development-only: how the score is built up, live, and what solving right now would add.
// Not rendered in production builds.
import { AwardReason, type ScoreBreakdown } from "../engine";
import "./ScoreBreakdownPanel.css";
import { formatDuration, formatMultiplier, formatPoints } from "./format";

const REASON_LABELS: Readonly<Record<AwardReason, string>> = {
  [AwardReason.Digit]: "Cijfers",
  [AwardReason.Unit]: "Rij/kolom/blok",
  [AwardReason.DigitCompleted]: "Cijfer compleet",
  [AwardReason.Mistake]: "Fouten",
  [AwardReason.Hint]: "Hints (÷2)",
  [AwardReason.Solve]: "Opgelost",
  [AwardReason.Flawless]: "Foutloos",
  [AwardReason.Speed]: "Snelheid",
  [AwardReason.Notes]: "Weinig aantekeningen",
};

/** Points earned during play, in the order they usually come. */
const PLAY_REASONS: readonly AwardReason[] = [AwardReason.Digit, AwardReason.Unit, AwardReason.DigitCompleted, AwardReason.Mistake, AwardReason.Hint];

const signed = (points: number) => (points > 0 ? `+${formatPoints(points)}` : formatPoints(points));

function amountClass(points: number): string {
  if (points < 0) return "score-breakdown__amount score-breakdown__amount--negative";
  if (points > 0) return "score-breakdown__amount score-breakdown__amount--positive";
  return "score-breakdown__amount";
}

interface ScoreBreakdownPanelProps {
  breakdown: ScoreBreakdown;
  /** Once solved, the finale bonuses are paid: show them instead of a projection. */
  solved: boolean;
}

export function ScoreBreakdownPanel({ breakdown, solved }: ScoreBreakdownPanelProps) {
  const projected = new Map(breakdown.projectedSolve.map((award) => [award.reason, award.points]));
  const finalePoints = (reason: AwardReason) => (solved ? breakdown.pointsByReason[reason] : (projected.get(reason) ?? 0));
  const finale: readonly AwardReason[] = [AwardReason.Solve, AwardReason.Flawless, AwardReason.Speed, AwardReason.Notes];
  return (
    <aside className="score-breakdown" aria-label="Score-opbouw (ontwikkelaar)">
      <h2>Score-opbouw</h2>

      <table>
        <caption>Verdiend</caption>
        <tbody>
          {PLAY_REASONS.map((reason) => (
            <tr key={reason}>
              <th scope="row">{REASON_LABELS[reason]}</th>
              <td className={amountClass(breakdown.pointsByReason[reason])}>{signed(breakdown.pointsByReason[reason])}</td>
            </tr>
          ))}
          <tr className="score-breakdown__total">
            <th scope="row">Nu</th>
            <td>{formatPoints(breakdown.points)}</td>
          </tr>
        </tbody>
      </table>

      <table>
        <caption>{solved ? "Eindbonussen" : "Bij oplossen nu"}</caption>
        <tbody>
          {finale.map((reason) => (
            <tr key={reason} className={solved ? undefined : "score-breakdown__projected"}>
              <th scope="row">{REASON_LABELS[reason]}</th>
              <td className={amountClass(finalePoints(reason))}>{signed(finalePoints(reason))}</td>
            </tr>
          ))}
          <tr className="score-breakdown__total">
            <th scope="row">{solved ? "Eindscore" : "Verwacht eind"}</th>
            <td>{formatPoints(solved ? breakdown.points : breakdown.projectedTotal)}</td>
          </tr>
        </tbody>
      </table>

      <dl>
        <dt>Combo</dt>
        <dd>
          {breakdown.combo} op rij · {formatMultiplier(breakdown.multiplier)}
        </dd>
        <dt>Volgend goed cijfer</dt>
        <dd>+{formatPoints(breakdown.nextDigitPoints)}</dd>
        <dt>Volgende fout</dt>
        <dd className="score-breakdown__amount--negative">
          −{formatPoints(breakdown.nextMistakePenalty)}
          {breakdown.flawlessPossible && " + foutloos-bonus"}
        </dd>
        <dt>Tijd / doel</dt>
        <dd>
          {formatDuration(breakdown.elapsedMs)} / {formatDuration(breakdown.targetTimeMs)}
        </dd>
        <dt>Aantekeningen / budget</dt>
        <dd>
          {breakdown.noteMarks} / {breakdown.notesBudget}
        </dd>
      </dl>
    </aside>
  );
}
