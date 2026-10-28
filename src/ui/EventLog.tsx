// Debug view of engine events: the animation layer (phase 5) will react to exactly these.
import type { GameEvent } from "../engine";
import type { LoggedEvent } from "./session";

function describe(event: GameEvent): string {
  const { type, ...details } = event;
  const shown = Object.entries(details).map(([key, value]) => {
    if (key === "unit" && value && typeof value === "object" && "kind" in value && "index" in value) return `unit=${value.kind} ${Number(value.index) + 1}`;
    if (key === "action") return `action=${(value as { type: string }).type}`;
    return `${key}=${Array.isArray(value) ? `[${value.join(",")}]` : String(value)}`;
  });
  return `${type} ${shown.join(" ")}`;
}

export function EventLog({ log }: { log: LoggedEvent[] }) {
  return (
    <details className="event-log" open>
      <summary>Engine-events</summary>
      {log.length === 0 ? (
        <p className="event-log__empty">Nog geen events.</p>
      ) : (
        <ol>
          {log.map(({ id, event }) => (
            <li key={id} className={`event-log__item event-log__item--${event.type}`}>
              {describe(event)}
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}
