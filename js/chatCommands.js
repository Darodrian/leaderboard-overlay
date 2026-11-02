export function parseChatCommand(text) {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (normalized === '!leaderboard refresh') return { command: 'refresh' };
  if (normalized === '!leaderboard clear stream') {
    return { command: 'clear-stream' };
  }
  return null;
}

export function canModerate(badges, userId, broadcasterId) {
  if (userId && userId === broadcasterId) return true;
  return Boolean(badges.broadcaster || badges.moderator);
}

export async function applyCommand(deps, input) {
  if (!canModerate(input.badges, input.userId, input.broadcasterId)) {
    return 'rejected';
  }

  const event =
    input.command === 'refresh' ? 'command.refresh' : 'command.clear-stream';

  if (input.command === 'clear-stream') {
    await deps.clearStreamWindow(input.streamerId);
  }

  await deps.broadcast(input.streamerId, event, { type: event });

  return 'applied';
}
