export const TOTAL = 28;

export function createState({ lit = [], missingAudio = [] } = {}) {
  return {
    status: 'idle',
    playingName: null,
    lit: [...new Set(lit)],
    missingAudio: [...new Set(missingAudio)],
  };
}

export function beginPlayback(state, name) {
  if (state.status === 'playing') return null;
  return { ...state, status: 'playing', playingName: name };
}

export function completePlayback(state, name, { missingAudio = false } = {}) {
  if (state.playingName !== name) return state;

  const lit = state.lit.includes(name) ? state.lit : [...state.lit, name];
  const missing = missingAudio && !state.missingAudio.includes(name)
    ? [...state.missingAudio, name]
    : state.missingAudio;

  return {
    ...state,
    status: 'idle',
    playingName: null,
    lit,
    missingAudio: missing,
  };
}

export function cancelPlayback(state) {
  if (state.status !== 'playing') return state;
  return { ...state, status: 'idle', playingName: null };
}

export function isLit(state, name) {
  return state.lit.includes(name);
}

export function countLit(state) {
  return state.lit.length;
}

export function isComplete(state) {
  return state.lit.length >= TOTAL;
}

export function resetState() {
  return createState();
}
