import { loadState, saveState } from '../services/storage.js';
import { uid } from '../utils/id.js';

export function createStore() {
  let state = loadState();
  const subscribers = new Set();

  function emit() {
    subscribers.forEach((fn) => fn(state));
  }

  function getState() {
    return state;
  }

  function addActivity(message, type = 'info') {
    state = {
      ...state,
      activity: [
        { id: uid('act'), type, message, at: new Date().toISOString() },
        ...state.activity
      ].slice(0, 200)
    };
  }

  function setState(next, options = {}) {
    state = saveState(next);
    if (!options.skipActivity && options.activityMessage) {
      addActivity(options.activityMessage, options.activityType || 'info');
      state = saveState(state);
    }
    emit();
    return state;
  }

  function update(mutator, options = {}) {
    const draft = typeof structuredClone === 'function'
      ? structuredClone(state)
      : JSON.parse(JSON.stringify(state));
    mutator(draft);
    return setState(draft, options);
  }

  function subscribe(fn) {
    subscribers.add(fn);
    fn(state);
    return () => subscribers.delete(fn);
  }

  return {
    getState,
    setState,
    update,
    subscribe,
    addActivity: (message, type = 'info') => {
      addActivity(message, type);
      state = saveState(state);
      emit();
    }
  };
}
