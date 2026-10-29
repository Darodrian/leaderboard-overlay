import type { LeaderboardRow, OverlaySettings, WindowType } from "@/lib/types";

const MEDALS = ["🥇", "🥈", "🥉"];

type Props = {
  rows: LeaderboardRow[];
  settings: OverlaySettings;
  window: WindowType;
};

export function Leaderboard({ rows, settings, window }: Props) {
  const hidden = new Set(
    settings.hiddenAccounts.map((account) => account.toLowerCase()),
  );

  const visible = [...rows]
    .filter((row) => !hidden.has(row.username.toLowerCase()))
    .sort((a, b) => b.points - a.points)
    .slice(0, 25);

  const max = Math.max(1, ...visible.map((row) => row.points));
  const showRankColumn = settings.display.ranks;

  return (
    <ol className="lb-list" data-window={window}>
      {visible.map((row, index) => {
        const rank = index + 1;
        const showMedal = showRankColumn && settings.display.medals && rank <= 3;

        return (
          <li className="lb-row" data-rank={rank} key={row.userId}>
            {showMedal ? (
              <span className="lb-medal" aria-hidden>
                {MEDALS[rank - 1]}
              </span>
            ) : null}
            {showRankColumn && settings.display.rankNumbers ? (
              <span className="lb-rank">#{rank}</span>
            ) : null}
            <span className="lb-name">{row.username}</span>
            {settings.display.amounts ? (
              <span className="lb-points">{row.points.toLocaleString()}</span>
            ) : null}
            {settings.display.bars ? (
              <span className="lb-bar" aria-hidden>
                <span
                  className="lb-bar-fill"
                  style={{
                    width: `${Math.max(2, (row.points / max) * 100)}%`,
                  }}
                />
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
