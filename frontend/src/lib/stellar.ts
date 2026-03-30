import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  Networks,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk'
import { signTransaction } from '@stellar/freighter-api'

export const STROOPS_SCALE = 10_000_000n
const MAX_DECIMALS = 7
const STATIC_SIMULATION_ACCOUNT = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'

const PRIMARY_RPC = import.meta.env.VITE_STELLAR_RPC_PRIMARY ?? 'https://mainnet.sorobanrpc.com'
const SECONDARY_RPC = import.meta.env.VITE_STELLAR_RPC_SECONDARY ?? 'https://soroban-rpc.publicnode.com'
const NETWORK_PASSPHRASE = import.meta.env.VITE_STELLAR_NETWORK_PASSPHRASE ?? Networks.PUBLIC
const NETWORK_LABEL = NETWORK_PASSPHRASE === Networks.PUBLIC ? 'PUBLIC' : NETWORK_PASSPHRASE === Networks.TESTNET ? 'TESTNET' : 'CUSTOM'

const CONTRACT_ID = import.meta.env.VITE_PASADAFUND_CONTRACT_ID ?? ''

export type ProposalView = {
  id: number
  proposer: string
  recipient: string
  amountStroops: bigint
  title: string
  details: string
  votes: number
  approved: boolean
  executed: boolean
}

export type TxHistoryItem = {
  id: string
  action: string
  status: 'success' | 'failed'
  hash: string
  rpcUrl: string
  note?: string
  amount?: bigint
  time: string
}

type EventPayload = {
  eventAction: string
  amount?: bigint
  note?: string
}

function createServers() {
  return [PRIMARY_RPC, SECONDARY_RPC].map((url) => ({
    url,
    server: new rpc.Server(url, { allowHttp: false }),
  }))
}

function normalizeMethodArgs(args: Array<string | number | bigint>): xdr.ScVal[] {
  return args.map((arg) => {
    if (typeof arg === 'bigint') {
      return nativeToScVal(arg, { type: 'i128' })
    }
    if (typeof arg === 'number') {
      return nativeToScVal(arg, { type: 'u32' })
    }
    if (typeof arg === 'string' && arg.startsWith('G') && arg.length >= 56) {
      return new Address(arg).toScVal()
    }
    return nativeToScVal(arg)
  })
}

async function withRpcFallback<T>(fn: (server: rpc.Server, rpcUrl: string) => Promise<T>): Promise<T> {
  const servers = createServers()
  let lastError: unknown = null

  for (const candidate of servers) {
    try {
      return await fn(candidate.server, candidate.url)
    } catch (error) {
      lastError = error
    }
  }

  if (lastError instanceof Error) {
    throw new Error(`All Soroban RPC endpoints failed: ${lastError.message}`)
  }
  throw new Error('All Soroban RPC endpoints failed')
}

function decodeScValToBigInt(value: xdr.ScVal): bigint {
  const native = scValToNative(value)
  if (typeof native === 'bigint') {
    return native
  }
  if (typeof native === 'number') {
    return BigInt(native)
  }
  return BigInt(String(native))
}

function extractRetval(simulation: rpc.Api.SimulateTransactionResponse): xdr.ScVal {
  if ('result' in simulation && simulation.result?.retval) {
    return simulation.result.retval
  }
  throw new Error('Simulation did not return a contract value')
}

function decodeProposal(raw: unknown): ProposalView {
  const data = raw as Record<string, unknown>
  return {
    id: Number(data.id),
    proposer: String(data.proposer),
    recipient: String(data.recipient),
    amountStroops: BigInt(String(data.amount_stroops)),
    title: String(data.title),
    details: String(data.details),
    votes: Number(data.votes),
    approved: Boolean(data.approved),
    executed: Boolean(data.executed),
  }
}

function decodeEvent(topics: xdr.ScVal[], value: xdr.ScVal): EventPayload {
  const topicZero = topics.length > 0 ? String(scValToNative(topics[0])) : ''
  const decodedValue = scValToNative(value)

  if (topicZero === 'contrib') {
    return {
      eventAction: 'On-chain Contribution',
      amount: BigInt(String(decodedValue)),
    }
  }

  if (topicZero === 'request') {
    const tuple = decodedValue as Array<unknown>
    return {
      eventAction: 'On-chain Request',
      amount: tuple?.[1] !== undefined ? BigInt(String(tuple[1])) : undefined,
    }
  }

  if (topicZero === 'vote') {
    const tuple = decodedValue as Array<unknown>
    return {
      eventAction: 'On-chain Vote',
      note: `votes=${String(tuple?.[1] ?? '?')} approved=${String(tuple?.[2] ?? '?')}`,
    }
  }

  if (topicZero === 'execute') {
    const tuple = decodedValue as Array<unknown>
    return {
      eventAction: 'On-chain Execution',
      amount: tuple?.[1] !== undefined ? BigInt(String(tuple[1])) : undefined,
    }
  }

  return {
    eventAction: 'On-chain Event',
  }
}

export function parseToStroops(input: string): bigint {
  const normalized = input.trim()
  if (!normalized) {
    throw new Error('Amount is required')
  }
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error('Invalid amount format')
  }

  const [whole, fractionRaw = ''] = normalized.split('.')
  if (fractionRaw.length > MAX_DECIMALS) {
    throw new Error('Maximum precision is 7 decimal places')
  }

  const fraction = fractionRaw.padEnd(MAX_DECIMALS, '0')
  return BigInt(whole) * STROOPS_SCALE + BigInt(fraction)
}

export function formatStroops(stroops: bigint): string {
  const sign = stroops < 0n ? '-' : ''
  const absolute = stroops < 0n ? stroops * -1n : stroops
  const whole = absolute / STROOPS_SCALE
  const fraction = absolute % STROOPS_SCALE
  return `${sign}${whole.toString()}.${fraction.toString().padStart(MAX_DECIMALS, '0')}`
}

export function shortAddress(address: string): string {
  if (!address || address.length < 12) {
    return address
  }
  return `${address.slice(0, 6)}...${address.slice(-6)}`
}

export class PasadaFundClient {
  readonly networkPassphrase = NETWORK_PASSPHRASE
  readonly networkLabel = NETWORK_LABEL

  hasContractConfiguration(): boolean {
    return Boolean(CONTRACT_ID)
  }

  private buildInvokeTx(source: Account, method: string, args: Array<string | number | bigint>) {
    if (!CONTRACT_ID) {
      throw new Error('Missing VITE_PASADAFUND_CONTRACT_ID environment variable')
    }

    const contract = new Contract(CONTRACT_ID)
    const op = contract.call(method, ...normalizeMethodArgs(args))

    return new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(op)
      .setTimeout(60)
      .build()
  }

  private async simulate(method: string, args: Array<string | number | bigint>) {
    const source = new Account(STATIC_SIMULATION_ACCOUNT, '0')
    const tx = this.buildInvokeTx(source, method, args)

    return withRpcFallback(async (server, rpcUrl) => {
      const simulation = await server.simulateTransaction(tx)
      if ('error' in simulation && simulation.error) {
        throw new Error(`RPC simulation failed on ${rpcUrl}: ${simulation.error}`)
      }
      if (!('result' in simulation)) {
        throw new Error(`Unexpected simulation response from ${rpcUrl}`)
      }
      return { simulation, rpcUrl }
    })
  }

  private async submit(method: string, wallet: string, args: Array<string | number | bigint>) {
    return withRpcFallback(async (server, rpcUrl) => {
      await this.simulate(method, args)

      const sourceAccount = await server.getAccount(wallet)
      const built = this.buildInvokeTx(sourceAccount, method, args)
      const prepared = await server.prepareTransaction(built)

      const signed = await signTransaction(prepared.toXDR(), {
        address: wallet,
        networkPassphrase: NETWORK_PASSPHRASE,
      })

      if (signed.error || !signed.signedTxXdr) {
        throw new Error(signed.error?.message ?? 'Freighter did not return signed transaction')
      }

      const signedTx = TransactionBuilder.fromXDR(signed.signedTxXdr, NETWORK_PASSPHRASE)
      const send = await server.sendTransaction(signedTx)

      if (!('hash' in send)) {
        throw new Error('Transaction submission failed')
      }

      await server.pollTransaction(send.hash)
      return { hash: send.hash, rpcUrl }
    })
  }

  async getTreasuryBalance(): Promise<bigint> {
    const { simulation } = await this.simulate('treasury_balance', [])
    return decodeScValToBigInt(extractRetval(simulation))
  }

  async getMembers(): Promise<string[]> {
    const { simulation } = await this.simulate('get_members', [])
    const raw = scValToNative(extractRetval(simulation))
    if (!Array.isArray(raw)) {
      return []
    }
    return raw.map((item) => String(item))
  }

  async getProposalCount(): Promise<number> {
    const { simulation } = await this.simulate('proposal_count', [])
    return Number(scValToNative(extractRetval(simulation)) ?? 0)
  }

  async getProposal(id: number): Promise<ProposalView> {
    const { simulation } = await this.simulate('get_proposal', [id])
    const native = scValToNative(extractRetval(simulation))
    return decodeProposal(native)
  }

  async contribute(wallet: string, amountStroops: bigint) {
    return this.submit('contribute', wallet, [wallet, amountStroops])
  }

  async submitRequest(wallet: string, recipient: string, amountStroops: bigint, title: string, details: string) {
    return this.submit('submit_request', wallet, [wallet, recipient, amountStroops, title, details])
  }

  async vote(wallet: string, proposalId: number) {
    return this.submit('vote', wallet, [wallet, proposalId])
  }

  async execute(wallet: string, proposalId: number) {
    return this.submit('execute', wallet, [wallet, proposalId])
  }

  async getRecentEvents(limit = 20): Promise<TxHistoryItem[]> {
    if (!CONTRACT_ID) {
      return []
    }

    return withRpcFallback(async (server, rpcUrl) => {
      const latest = await server.getLatestLedger()
      const startLedger = Math.max(1, latest.sequence - 500)
      const events = await server.getEvents({
        startLedger,
        limit,
        filters: [
          {
            type: 'contract',
            contractIds: [CONTRACT_ID],
          },
        ],
      })

      return events.events.map((event) => {
        const decoded = decodeEvent(event.topic, event.value)
        return {
          id: `${event.id}-${rpcUrl}`,
          action: decoded.eventAction,
          status: 'success' as const,
          hash: event.txHash,
          rpcUrl,
          note: decoded.note,
          amount: decoded.amount,
          time: event.ledgerClosedAt,
        }
      })
    })
  }
}
