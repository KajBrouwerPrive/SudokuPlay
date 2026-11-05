// The statistics page: totals, streaks, a card per level, a score chart and the latest games.
import { useMemo } from "react";
import { type Difficulty } from "../engine";
import { GameOutcome, summarize, type StatsData } from "../stats/stats";
import { formatDuration, formatPoints } from "./format";
import { ScoreChart } from "./ScoreChart";
import "./StatsPage.css";
import { useCountUp } from "./useCountUp";

const DATE_FORMAT = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short" });
const NOTHING = "–";
const OUTCOME_LABELS: Readonly<Record<GameOutcome, string>> = { [GameOutcome.Solved]: "Opgelost", [GameOutcome.Abandoned]: "Gestopt" };
const OUTCOME_MARKS: Readonly<Record<GameOutcome, string>> = { [GameOutcome.Solved]: "✓", [GameOutcome.Abandoned]: "✕" };
const MISTAKES_FORMAT = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 });
const formatMistakes = (value: number) => MISTAKES_FORMAT.format(value);

interface StatsPageProps {
  stats: StatsData;
  difficultyLabels: Readonly<Record<Difficulty, string>>;
  reducedMotion: boolean;
  onBack: () => void;
}

function Tile({ label, value, reducedMotion, format = formatPoints }: { label: string; value: number; reducedMotion: boolean; format?: (value: number) => string }) {
  const shown = useCountUp(value, reducedMotion);
  return (
    <div className="stats-tile">
      <span className="stats-tile__value">{format(shown)}</span>
      <span className="stats-tile__label">{label}</span>
    </div>
  );
}

const orNothing = (value: number | null, format: (value: number) => string) => (value === null ? NOTHING : format(value));

export function StatsPage({ stats, difficultyLabels, reducedMotion, onBack }: StatsPageProps) {
  const summary = useMemo(() => summarize(stats, new Date()), [stats]);
  return (
    <main className="app stats">
      <header className="toolbar">
        <h1>Statistieken</h1>
        <button type="button" className="button--primary" onClick={onBack}>
          Terug naar spel
        </button>
      </header>

      {summary.gamesPlayed === 0 ? (
        <p className="stats__empty">Nog geen spellen gespeeld. Los een puzzel op en je ziet hier je punten, tijden en reeksen.</p>
      ) : (
        <>
          <section className="stats__tiles" aria-label="Totaal">
            <Tile label="punten totaal" value={summary.totalPoints} reducedMotion={reducedMotion} />
            <Tile label={`opgelost van ${summary.gamesPlayed}`} value={summary.gamesSolved} reducedMotion={reducedMotion} />
            <Tile label={`foutloos opgelost (${formatMistakes(summary.totalMistakes)} fouten totaal)`} value={summary.flawlessSolved} reducedMotion={reducedMotion} />
            <Tile label={summary.dayStreak === 1 ? "dag op rij" : "dagen op rij"} value={summary.dayStreak} reducedMotion={reducedMotion} />
            <Tile label={`op rij opgelost (record ${summary.bestSolvedStreak})`} value={summary.solvedStreak} reducedMotion={reducedMotion} />
          </section>

          <section className="stats__section">
            <h2>Per niveau</h2>
            <div className="stats__levels">
              {summary.levels.map((level) => (
                <article key={level.difficulty} className="stats-level">
                  <h3>{difficultyLabels[level.difficulty]}</h3>
                  <dl>
                    <dt>Opgelost</dt>
                    <dd>
                      {level.solved} / {level.played}
                    </dd>
                    <dt>Beste score</dt>
                    <dd>{orNothing(level.bestPoints, formatPoints)}</dd>
                    <dt>Snelste tijd</dt>
                    <dd>{orNothing(level.bestTimeMs, formatDuration)}</dd>
                    <dt>Gemiddeld</dt>
                    <dd>{orNothing(level.averageTimeMs, formatDuration)}</dd>
                    <dt>Gem. fouten</dt>
                    <dd>{orNothing(level.averageMistakes, formatMistakes)}</dd>
                  </dl>
                </article>
              ))}
            </div>
          </section>

          {summary.scoreHistory.length > 0 && (
            <section className="stats__section">
              <h2>Punten per opgeloste puzzel</h2>
              <ScoreChart scores={summary.scoreHistory} />
            </section>
          )}

          <section className="stats__section">
            <h2>Laatste spellen</h2>
            <div className="stats__table-scroll">
              <table className="stats__recent">
                <thead>
                  <tr>
                    <th scope="col">Wanneer</th>
                    <th scope="col">Niveau</th>
                    <th scope="col">Punten</th>
                    <th scope="col">Fouten</th>
                    <th scope="col">Hints</th>
                    <th scope="col">Tijd</th>
                    <th scope="col">
                      <span className="visually-hidden">Uitkomst</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {summary.recent.map((game) => (
                    <tr key={game.finishedAt + game.seed}>
                      <td>{DATE_FORMAT.format(new Date(game.finishedAt))}</td>
                      <td>{difficultyLabels[game.difficulty]}</td>
                      <td className="stats__number">{formatPoints(game.points)}</td>
                      <td className={game.mistakes > 0 ? "stats__number stats__mistakes" : "stats__number"}>{game.mistakes}</td>
                      <td className="stats__number">{game.hints}</td>
                      <td className="stats__number">{formatDuration(game.durationMs)}</td>
                      <td className="stats__outcome" title={OUTCOME_LABELS[game.outcome]}>
                        <span aria-hidden="true">{OUTCOME_MARKS[game.outcome]}</span>
                        <span className="visually-hidden">{OUTCOME_LABELS[game.outcome]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
