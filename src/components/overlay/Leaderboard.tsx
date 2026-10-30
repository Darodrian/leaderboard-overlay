import type { BoardType, LeaderboardRow, OverlaySettings, WindowType } from "@/lib/types";
import { BOARD_LABELS, formatBoardQuantity } from "@/lib/settings";

const MEDALS = ["🥇", "🥈", "🥉"];

type Props = {
  rows: LeaderboardRow[];
  board: BoardType;
  settings: OverlaySettings;
  window: WindowType;
};

export function Leaderboard({ rows, board, settings, window }: Props) {
  const hidden = new Set(
    settings.hiddenAccounts.map((account) => account.toLowerCase()),
  );

  const boardCfg = settings.boards[board];
  const rankCount = boardCfg?.rankCount ?? 25;

  const visible = [...rows]
    .filter((row) => !hidden.has(row.username.toLowerCase()))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, rankCount);

  const max = Math.max(1, ...visible.map((row) => row.quantity));
  const showRankColumn = settings.display.ranks;

  // Resolve board label: custom override > board default name
  const boardLabel =
    settings.boardLabels?.[board] ?? BOARD_LABELS[board];

  return (
    <ol className="lb-list" data-window={window} data-board={board}>
      <header className="lb-board-header">
        <span className="lb-board-label-main">{boardLabel}</span>
        <span className="lb-board-label-sub">{window}</span>
      </header>
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
              <span className="lb-quantity">
                {formatBoardQuantity(board, row.quantity)}
              </span>
            ) : null}
            {settings.display.bars ? (
              <span className="lb-bar" aria-hidden>
                <span
                  className="lb-bar-fill"
                  style={{
                    width: `${Math.max(2, (row.quantity / max) * 100)}%`,
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
