import { useEffect, useMemo, useState } from 'react'
import confetti from 'canvas-confetti'
import { getAddress, requestAccess } from '@stellar/freighter-api'
import {
  PasadaFundClient,
  STROOPS_SCALE,
  formatStroops,
  parseToStroops,
  shortAddress,
  type ProposalView,
  type TxHistoryItem,
} from './lib/stellar'
import './App.css'

function App() {
  const client = useMemo(() => new PasadaFundClient(), [])
  const [wallet, setWallet] = useState('')
  const [networkLabel, setNetworkLabel] = useState('Public')
  const [treasuryBalance, setTreasuryBalance] = useState<bigint>(0n)
  const [memberCount, setMemberCount] = useState(0)
  const [proposalCount, setProposalCount] = useState(0)
  const [proposals, setProposals] = useState<ProposalView[]>([])
  const [localHistory, setLocalHistory] = useState<TxHistoryItem[]>([])
  const [chainHistory, setChainHistory] = useState<TxHistoryItem[]>([])
  const [status, setStatus] = useState('Ready for governance operations.')
  const [isBusy, setIsBusy] = useState(false)
  const [glow, setGlow] = useState(false)

  const [depositAmount, setDepositAmount] = useState('1')
  const [recipient, setRecipient] = useState('')
  const [proposalTitle, setProposalTitle] = useState('')
  const [proposalDetails, setProposalDetails] = useState('')
  const [proposalAmount, setProposalAmount] = useState('')
  const [voteId, setVoteId] = useState('1')
  const [executeId, setExecuteId] = useState('1')

  const hasContractConfig = client.hasContractConfiguration()
  const mergedHistory = useMemo(
    () => [...localHistory, ...chainHistory]
      .sort((a, b) => Date.parse(b.time) - Date.parse(a.time))
      .slice(0, 16),
    [localHistory, chainHistory],
  )

  const pushHistory = (entry: Omit<TxHistoryItem, 'id' | 'time'>) => {
    setLocalHistory((prev) => [
      {
        ...entry,
        id: crypto.randomUUID(),
        time: new Date().toISOString(),
      },
      ...prev,
    ].slice(0, 16))
  }

  const refreshDashboard = async () => {
    if (!hasContractConfig) {
      setStatus('Set VITE_PASADAFUND_CONTRACT_ID and VITE_NATIVE_XLM_CONTRACT_ID to load live data.')
      return
    }

    try {
      const [balance, members, count] = await Promise.all([
        client.getTreasuryBalance(),
        client.getMembers(),
        client.getProposalCount(),
      ])
      setTreasuryBalance(balance)
      setMemberCount(members.length)
      setProposalCount(count)

      const ids = Array.from({ length: count }, (_, i) => i + 1)
      const loaded = await Promise.all(ids.map((id) => client.getProposal(id)))
      const recentEvents = await client.getRecentEvents(12)
      setProposals(loaded.reverse())
      setChainHistory(recentEvents)
      setStatus('Dashboard synced from Soroban RPC.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to refresh dashboard')
    }
  }

  useEffect(() => {
    setNetworkLabel(client.networkLabel)
    void refreshDashboard()
    const timer = setInterval(() => {
      void refreshDashboard()
    }, 12000)
    return () => clearInterval(timer)
  }, [client])

  const connectWallet = async () => {
    try {
      await requestAccess()
      const addrResp = await getAddress()
      if (!addrResp.address) {
        throw new Error('Freighter wallet did not return a public address')
      }
      setWallet(addrResp.address)
      setStatus(`Wallet connected: ${shortAddress(addrResp.address)}`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to connect wallet')
    }
  }

  const submitAction = async (fn: () => Promise<{ hash: string; rpcUrl: string }>, successMessage: string, historyAction: string, amount?: bigint) => {
    if (!wallet) {
      setStatus('Connect Freighter first.')
      return
    }

    setIsBusy(true)
    try {
      const result = await fn()
      pushHistory({ action: historyAction, status: 'success', hash: result.hash, rpcUrl: result.rpcUrl, amount })
      setStatus(`${successMessage} Tx: ${result.hash}`)
      await refreshDashboard()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Transaction failed'
      pushHistory({ action: historyAction, status: 'failed', hash: '-', rpcUrl: 'n/a', note: message, amount })
      setStatus(message)
    } finally {
      setIsBusy(false)
    }
  }

  const handleDeposit = async () => {
    const amount = parseToStroops(depositAmount)
    await submitAction(
      () => client.contribute(wallet, amount),
      'Deposit confirmed and treasury updated.',
      'Contribution',
      amount,
    )

    setGlow(true)
    void confetti({ particleCount: 160, spread: 78, startVelocity: 40, colors: ['#ffca56', '#ffd977', '#e6a82d', '#f6f7fb'] })
    setTimeout(() => setGlow(false), 1300)
  }

  const handleCreateProposal = async () => {
    const amount = parseToStroops(proposalAmount)
    await submitAction(
      () => client.submitRequest(wallet, recipient, amount, proposalTitle, proposalDetails),
      'Fuel subsidy request submitted on-chain.',
      'Submit Request',
      amount,
    )
  }

  const handleVote = async () => {
    const id = Number(voteId)
    if (!Number.isInteger(id) || id < 1) {
      setStatus('Proposal ID for voting must be a positive integer.')
      return
    }
    await submitAction(() => client.vote(wallet, id), 'Vote recorded on-chain.', 'Vote')
  }

  const handleExecute = async () => {
    const id = Number(executeId)
    if (!Number.isInteger(id) || id < 1) {
      setStatus('Proposal ID for execution must be a positive integer.')
      return
    }
    await submitAction(() => client.execute(wallet, id), 'Approved payout executed from treasury.', 'Execute')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="brand-kicker">Stellar Fuel Relief DAO</p>
          <h1>PasadaFund</h1>
          <p className="tagline">Institutional-grade treasury governance for Jeepney and Tricycle transport cooperatives.</p>
        </div>
        <button
          className="action-btn"
          onClick={connectWallet}
          disabled={isBusy}
        >
          {wallet ? `Wallet ${shortAddress(wallet)}` : 'Connect Freighter'}
        </button>
      </header>

      <section className={`hero-panel ${glow ? 'pulse' : ''}`}>
        <article className="metric-card">
          <span>Treasury Balance</span>
          <strong>{formatStroops(treasuryBalance)} XLM</strong>
          <small>Stored in real SAC native token units ({STROOPS_SCALE.toString()} stroops per XLM)</small>
        </article>
        <article className="metric-card">
          <span>Members</span>
          <strong>{memberCount}</strong>
          <small>Any contributor becomes a governance member</small>
        </article>
        <article className="metric-card">
          <span>Proposals</span>
          <strong>{proposalCount}</strong>
          <small>Approval threshold: 2 votes</small>
        </article>
        <article className="metric-card">
          <span>Network</span>
          <strong>{networkLabel}</strong>
          <small>{hasContractConfig ? 'Contract and native token IDs configured' : 'Missing contract env configuration'}</small>
        </article>
      </section>

      <section className="grid">
        <article className="card">
          <h2>Treasury Contribution</h2>
          <p className="microcopy">Deposit live XLM into the DAO treasury. Input values are converted to stroops with BigInt precision.</p>
          <label>
            Deposit Amount (XLM)
            <input value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} placeholder="1.2500000" />
          </label>
          <button className="action-btn" onClick={() => void handleDeposit()} disabled={isBusy || !hasContractConfig}>Deposit to Treasury</button>
        </article>

        <article className="card">
          <h2>Fuel Subsidy Request</h2>
          <p className="microcopy">Transport groups can submit a grant request with recipient wallet, title, and details.</p>
          <label>
            Recipient Address
            <input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="G..." />
          </label>
          <label>
            Request Title
            <input value={proposalTitle} onChange={(event) => setProposalTitle(event.target.value)} placeholder="Week 2 Diesel Relief" />
          </label>
          <label>
            Amount (XLM)
            <input value={proposalAmount} onChange={(event) => setProposalAmount(event.target.value)} placeholder="250" />
          </label>
          <label>
            Proposal Details
            <textarea value={proposalDetails} onChange={(event) => setProposalDetails(event.target.value)} placeholder="Route coverage, member count, and expected duration" />
          </label>
          <button className="action-btn" onClick={() => void handleCreateProposal()} disabled={isBusy || !hasContractConfig}>Submit Request</button>
        </article>

        <article className="card">
          <h2>Governance Actions</h2>
          <p className="microcopy">Members vote and then execute approved payouts directly from the on-chain treasury.</p>
          <label>
            Vote Proposal ID
            <input value={voteId} onChange={(event) => setVoteId(event.target.value)} placeholder="1" />
          </label>
          <button className="action-btn" onClick={() => void handleVote()} disabled={isBusy || !hasContractConfig}>Cast Vote</button>
          <label>
            Execute Proposal ID
            <input value={executeId} onChange={(event) => setExecuteId(event.target.value)} placeholder="1" />
          </label>
          <button className="action-btn" onClick={() => void handleExecute()} disabled={isBusy || !hasContractConfig}>Execute Approved Proposal</button>
        </article>
      </section>

      <section className="grid bottom-grid">
        <article className="card span-two">
          <h2>Proposal Feed</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Title</th>
                  <th>Recipient</th>
                  <th>Amount</th>
                  <th>Votes</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {proposals.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No proposals found.</td>
                  </tr>
                ) : (
                  proposals.map((proposal) => (
                    <tr key={proposal.id}>
                      <td>{proposal.id}</td>
                      <td>{proposal.title}</td>
                      <td>{shortAddress(proposal.recipient)}</td>
                      <td>{formatStroops(proposal.amountStroops)} XLM</td>
                      <td>{proposal.votes}</td>
                      <td>
                        {proposal.executed
                          ? 'Executed'
                          : proposal.approved
                            ? 'Approved'
                            : 'Voting'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="card">
          <h2>Transaction Log</h2>
          <ul>
            {mergedHistory.length === 0 ? (
              <li className="history-item">No transactions yet.</li>
            ) : (
              mergedHistory.map((item) => (
                <li key={item.id} className="history-item">
                  <span>{item.action} • {item.status.toUpperCase()}</span>
                  <small>{new Date(item.time).toLocaleString()}</small>
                  <small>{item.amount ? `${formatStroops(item.amount)} XLM` : 'n/a'}</small>
                  <small>{item.hash}</small>
                  <small>{item.rpcUrl}</small>
                  {item.note ? <small>{item.note}</small> : null}
                </li>
              ))
            )}
          </ul>
        </article>
      </section>

      <footer className="footer-note">{status}</footer>
    </div>
  )
}

export default App
