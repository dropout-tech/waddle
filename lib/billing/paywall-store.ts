/**
 * Holds the purchase-screen state outside the screen itself, for one signed-in
 * user at a time.
 *
 * A purchase the store has finished but the server has not confirmed (or one
 * waiting for someone's approval) must still be "in progress" when the user
 * leaves the membership page and comes back; otherwise the plans are offered
 * again and a second tap makes the store switch plans and charge. It lives in
 * memory only: after a full app restart the server is the only source.
 *
 * The reducer is passed in (paywallReducer) so this file has no runtime imports
 * and can be unit tested as-is.
 */
export function createPaywallStore<S, E>(reduce: (state: S, event: E) => S, initial: S, opened: E) {
  let owner: string | null = null
  let state = initial
  const listeners = new Set<() => void>()
  function set(next: S) {
    if (next === state) return
    state = next
    listeners.forEach((listener) => listener())
  }
  return {
    /** The screen is being shown to this user. A different user starts from a blank slate. */
    open(userId: string) {
      if (owner !== userId) {
        owner = userId
        set(initial)
      }
      set(reduce(state, opened))
    },
    /** State for this user; anyone else gets the blank slate. */
    read(userId: string | undefined): S {
      return userId !== undefined && userId === owner ? state : initial
    },
    /** A result that arrives for a user who is no longer the current one is dropped. */
    dispatch(userId: string, event: E) {
      if (userId === owner) set(reduce(state, event))
    },
    /** Call with every auth change: sign-out or another account wipes the state. */
    userChanged(userId: string | null) {
      if (owner !== null && owner !== userId) {
        owner = null
        set(initial)
      }
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
