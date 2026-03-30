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

const FUEL_CONTEXT = [
  {
    label: 'Diesel Watch (Planning Baseline)',
    value: 'PHP 62.40/L',
    note: 'Reference value for subsidy planning and budget conversations.',
  },
  {
    label: 'Typical Jeepney Daily Fuel Need',
    value: '32-42 liters',
    note: 'Depends on route length, trapik, and terminal idle hours.',
  },
  {
    label: 'Priority Beneficiaries',
    value: 'Jeepney + Tricycle Groups',
    note: 'Focused on documented routes with transparent member rosters.',
  },
]

const EXPLORER_LINK = 'https://stellar.expert/explorer/testnet/contract/CCLVGF3AR5WGDZF4RWMLVXTIBH3YBXOV3CLAWXNB73NSKXJDHE62WMAJ'
const REPO_LINK = 'https://github.com/adr1el-m/stellar-PasadaFund'

function JeepneyBadge() {
  return (
    <svg className="jeepney-badge" viewBox="0 0 240 120" role="img" aria-label="Jeepney icon">
      <defs>
        <linearGradient id="jeepneyChrome" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffe8ad" />
          <stop offset="100%" stopColor="#e3a72f" />
        </linearGradient>
      </defs>
      <rect x="14" y="32" width="152" height="48" rx="10" fill="url(#jeepneyChrome)" />
      <rect x="166" y="40" width="44" height="40" rx="7" fill="#f7c85d" />
      <rect x="28" y="40" width="38" height="18" rx="3" fill="#1a1f27" />
      <rect x="72" y="40" width="38" height="18" rx="3" fill="#1a1f27" />
      <rect x="116" y="40" width="38" height="18" rx="3" fill="#1a1f27" />
      <rect x="169" y="47" width="34" height="12" rx="2" fill="#1a1f27" />
      <rect x="22" y="67" width="180" height="8" rx="4" fill="#bb7b12" />
      <circle cx="52" cy="87" r="14" fill="#0f1218" />
      <circle cx="52" cy="87" r="7" fill="#d8dce4" />
      <circle cx="154" cy="87" r="14" fill="#0f1218" />
      <circle cx="154" cy="87" r="7" fill="#d8dce4" />
      <path d="M206 42 L228 32 L228 80 L206 80 Z" fill="#f2b73c" />
    </svg>
  )
}

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
  const [presentationMode, setPresentationMode] = useState(false)

  const [simDrivers, setSimDrivers] = useState('120')
  const [simDailySubsidy, setSimDailySubsidy] = useState('80')
  const [simDays, setSimDays] = useState('5')

  const hasContractConfig = client.hasContractConfiguration()
  const approvedCount = proposals.filter((proposal) => proposal.approved).length
  const executedCount = proposals.filter((proposal) => proposal.executed).length
  const totalVotes = proposals.reduce((acc, proposal) => acc + proposal.votes, 0)
  const approvalRate = proposalCount > 0 ? Math.round((approvedCount / proposalCount) * 100) : 0
  const executionRate = approvedCount > 0 ? Math.round((executedCount / approvedCount) * 100) : 0
  const participationScore = proposalCount > 0
    ? Math.min(100, Math.round((totalVotes / (proposalCount * 2)) * 100))
    : 0
  const governanceScore = Math.round((approvalRate + executionRate + participationScore) / 3)

  const simulatedBudget = useMemo(() => {
    try {
      const drivers = Math.max(0, Math.floor(Number(simDrivers) || 0))
      const days = Math.max(0, Math.floor(Number(simDays) || 0))
      const dailySubsidyStroops = parseToStroops(simDailySubsidy || '0')
      return dailySubsidyStroops * BigInt(drivers) * BigInt(days)
    } catch {
      return 0n
    }
  }, [simDrivers, simDailySubsidy, simDays])

  const projectedRunwayDays = useMemo(() => {
    try {
      const drivers = Math.max(0, Math.floor(Number(simDrivers) || 0))
      if (drivers === 0) {
        return 0
      }
      const dailySubsidyStroops = parseToStroops(simDailySubsidy || '0')
      if (dailySubsidyStroops <= 0) {
        return 0
      }
      const dailyBurn = dailySubsidyStroops * BigInt(drivers)
      return Number(treasuryBalance / dailyBurn)
    } catch {
      return 0
    }
  }, [simDrivers, simDailySubsidy, treasuryBalance])

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
      'Deposit confirmed and reserve pool updated.',
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
      'Route support request submitted on-chain.',
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
    await submitAction(() => client.execute(wallet, id), 'Approved disbursement executed from reserve pool.', 'Execute')
  }

  return (
    <div className={`app-shell ${presentationMode ? 'presentation-mode' : ''}`}>
      <header className="topbar">
        <div className="headline-wrap">
          <p className="brand-kicker">Stellar Route Resilience Protocol</p>
          <h1>PasadaFund</h1>
          <p className="tagline">A transparent route resilience protocol for Jeepney and Tricycle operators facing rising fuel costs across the Philippines.</p>
          <p className="tagline-sub">Built for route associations, transport cooperatives, and LGU partners who need auditable support decisions on-chain.</p>
        </div>
        <JeepneyBadge />
        <button
          className="action-btn"
          onClick={connectWallet}
          disabled={isBusy}
        >
          {wallet ? `Wallet ${shortAddress(wallet)}` : 'Connect Freighter'}
        </button>
      </header>

      <section className="command-bar">
        <div className="command-group">
          <span>Hackathon Demo Controls</span>
          <button className="action-btn ghost" onClick={() => setPresentationMode((prev) => !prev)}>
            {presentationMode ? 'Presentation: ON' : 'Presentation: OFF'}
          </button>
        </div>
        <div className="proof-links">
          <a href={EXPLORER_LINK} target="_blank" rel="noreferrer">Live Contract</a>
          <a href={REPO_LINK} target="_blank" rel="noreferrer">Open Repository</a>
        </div>
      </section>

      <section className="story-grid">
        <article className="card story-card">
          <h2>Why PasadaFund Exists</h2>
          <p className="microcopy">Kapag tumataas ang presyo ng diesel at gasolina, lumiit ang pang-uwi ng mga tsuper. PasadaFund coordinates a transparent relief pool where every proposal, vote, and payout is visible, verifiable, and accountable.</p>
          <div className="story-points">
            <p><strong>Route-first:</strong> Supporters can contribute XLM and strengthen route-level continuity planning.</p>
            <p><strong>Transparent governance:</strong> Operational support requests are approved through on-chain voting.</p>
            <p><strong>Direct support:</strong> Approved disbursements move from reserve pool to beneficiary wallets without hidden handling.</p>
          </div>
        </article>
        <article className="card context-card">
          <h2>Fuel Reality Snapshot</h2>
          <div className="context-list">
            {FUEL_CONTEXT.map((item) => (
              <div key={item.label} className="context-item">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <small>{item.note}</small>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className={`hero-panel ${glow ? 'pulse' : ''}`}>
        <article className="metric-card">
          <span>Reserve Pool Balance</span>
          <strong>{formatStroops(treasuryBalance)} XLM</strong>
          <small>Stored in real SAC native token units ({STROOPS_SCALE.toString()} stroops per XLM)</small>
        </article>
        <article className="metric-card">
          <span>Members</span>
          <strong>{memberCount}</strong>
          <small>Any contributor becomes a protocol governance member</small>
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
        <article className="card span-two">
          <h2>Impact Simulator</h2>
          <p className="microcopy">Quickly estimate route support requirements during demos. Adjust target drivers, daily aid, and duration to show reserve planning in real time.</p>
          <div className="sim-grid">
            <label>
              Target Drivers
              <input value={simDrivers} onChange={(event) => setSimDrivers(event.target.value)} placeholder="120" />
            </label>
            <label>
              Daily Subsidy per Driver (XLM)
              <input value={simDailySubsidy} onChange={(event) => setSimDailySubsidy(event.target.value)} placeholder="80" />
            </label>
            <label>
              Program Days
              <input value={simDays} onChange={(event) => setSimDays(event.target.value)} placeholder="5" />
            </label>
          </div>
          <div className="sim-output">
            <p><span>Estimated Budget Need:</span> <strong>{formatStroops(simulatedBudget)} XLM</strong></p>
            <p><span>Projected Reserve Runway:</span> <strong>{projectedRunwayDays} days</strong></p>
          </div>
        </article>

        <article className="card">
          <h2>Governance Health</h2>
          <p className="microcopy">Judge-friendly KPI view based on proposal and voting activity.</p>
          <div className="health-kpis">
            <div><span>Approval Rate</span><strong>{approvalRate}%</strong></div>
            <div><span>Execution Rate</span><strong>{executionRate}%</strong></div>
            <div><span>Participation Score</span><strong>{participationScore}%</strong></div>
            <div><span>Governance Score</span><strong>{governanceScore}%</strong></div>
          </div>
        </article>
      </section>

      <section className="process-rail">
        <article className="step-card">
          <span>01</span>
          <h3>Fund Reserve Pool</h3>
          <p>Supporters deposit XLM into the protocol reserve pool and join governance.</p>
        </article>
        <article className="step-card">
          <span>02</span>
          <h3>Submit Operations Request</h3>
          <p>Transport groups submit route continuity requests with wallet, route details, and rationale.</p>
        </article>
        <article className="step-card">
          <span>03</span>
          <h3>Vote On-Chain</h3>
          <p>Members evaluate urgency and cast votes directly on Soroban.</p>
        </article>
        <article className="step-card">
          <span>04</span>
          <h3>Execute Disbursement</h3>
          <p>Approved requests are executed from reserve pool to beneficiary wallets with full audit history.</p>
        </article>
      </section>

      <section className="grid">
        <article className="card">
          <h2>Reserve Contribution</h2>
          <p className="microcopy">Deposit live XLM into the protocol reserve pool. Input values are converted to stroops with BigInt precision for financial accuracy.</p>
          <label>
            Deposit Amount (XLM)
            <input value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} placeholder="1.2500000" />
          </label>
          <button className="action-btn" onClick={() => void handleDeposit()} disabled={isBusy || !hasContractConfig}>Contribute to Reserve Pool</button>
        </article>

        <article className="card">
          <h2>Route Support Request</h2>
          <p className="microcopy">Transport groups can submit an operations support request with recipient wallet, title, and route-level details.</p>
          <label>
            Recipient Address
            <input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="G..." />
          </label>
          <label>
            Request Title
            <input value={proposalTitle} onChange={(event) => setProposalTitle(event.target.value)} placeholder="Week 2 Route Continuity Support" />
          </label>
          <label>
            Amount (XLM)
            <input value={proposalAmount} onChange={(event) => setProposalAmount(event.target.value)} placeholder="250" />
          </label>
          <label>
            Proposal Details
            <textarea value={proposalDetails} onChange={(event) => setProposalDetails(event.target.value)} placeholder="Ruta covered, driver count, operating window, and subsidy justification" />
          </label>
          <button className="action-btn" onClick={() => void handleCreateProposal()} disabled={isBusy || !hasContractConfig}>Submit Request</button>
        </article>

        <article className="card">
          <h2>Governance Actions</h2>
          <p className="microcopy">Members vote first, then execute approved disbursements directly from the on-chain reserve pool.</p>
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
          <h2>Transaction and Event Log</h2>
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
