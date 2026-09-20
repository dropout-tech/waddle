/** Integration boundary. Store SDK results must never be used as server authorization. */
export interface NativeBillingDriver {
  configure(options: { publicApiKey: string; appUserID: string }): Promise<void>
  listPackages(): Promise<Array<{ identifier: string; localizedPrice: string }>>
  purchase(packageIdentifier: string): Promise<void>
  restore(): Promise<void>
  logOut(): Promise<void>
}
export type BillingResult<T> = { status: 'ready'; value: T } | { status: 'not_configured' | 'sign_in_required' | 'failed' | 'cancelled' }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Create a fresh session after every auth-user change; never accept an email as appUserID. */
export function createNativeBillingSession(options: {
  driver?: NativeBillingDriver
  publicApiKey?: string
  authenticatedUserId?: string
  purchasesEnabled?: boolean
}) {
  let initialized = false
  let disposed = false
  let queue: Promise<unknown> = Promise.resolve()
  async function run<T>(action: (driver: NativeBillingDriver) => Promise<T>): Promise<BillingResult<T>> {
    if (!options.authenticatedUserId || !uuid.test(options.authenticatedUserId) || disposed) return { status: 'sign_in_required' }
    if (!options.driver || !options.publicApiKey || options.purchasesEnabled !== true) return { status: 'not_configured' }
    try {
      if (!initialized) {
        await options.driver.configure({ publicApiKey: options.publicApiKey, appUserID: options.authenticatedUserId })
        initialized = true
      }
      if (disposed) return { status: 'sign_in_required' }
      return { status: 'ready', value: await action(options.driver) }
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'userCancelled' in error && error.userCancelled === true) return { status: 'cancelled' }
      return { status: 'failed' }
    }
  }
  function enqueue<T>(action: (driver: NativeBillingDriver) => Promise<T>) {
    const pending = queue.then(() => run(action))
    queue = pending.catch(() => undefined)
    return pending
  }
  return {
    packages: () => enqueue((driver) => driver.listPackages()),
    // A completed store action means awaiting backend sync, never "Pro granted".
    purchase: (packageIdentifier: string) => enqueue(async (driver) => { await driver.purchase(packageIdentifier); return { awaitingServerSync: true } as const }),
    restore: () => enqueue(async (driver) => { await driver.restore(); return { awaitingServerSync: true } as const }),
    async dispose() {
      disposed = true
      await queue
      if (initialized) await options.driver?.logOut()
    },
  }
}
