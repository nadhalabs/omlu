export function createRefreshCoordinator(run) {
  let active = null;
  let reconcile = false;

  const refresh = () => {
    if (active) {
      reconcile = true;
      return active;
    }
    active = Promise.resolve()
      .then(run)
      .finally(() => {
        active = null;
        if (reconcile) {
          reconcile = false;
          void refresh();
        }
      });
    return active;
  };

  return refresh;
}
