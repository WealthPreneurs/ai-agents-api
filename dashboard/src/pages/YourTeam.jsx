import { AGENTS } from '../data/agents'
import AgentAvatar from '../components/AgentAvatar'

const LIVE_WORKER_KEYS = ['social_media_manager']

export default function YourTeam() {
  const agents = Object.entries(AGENTS)

  return (
    <div>
      <h2>Your Team</h2>
      <p className="page-subtitle">
        Meet the full AI worker bench. Only Jordan is live today — drafting
        the posts in your Approval Queue — the rest are shown here so you
        know who's next as new workers come online.
      </p>

      {agents.map(([workerKey, agent]) => {
        const isLive = LIVE_WORKER_KEYS.includes(workerKey)
        return (
        <div className="card agent-card" key={agent.id}>
          <AgentAvatar agent={agent} />
          <div className="agent-card-body">
            <div className="agent-card-header">
              <h3>{agent.name}</h3>
              <span className="agent-title">{agent.title}</span>
              <span className={isLive ? 'agent-status live' : 'agent-status'}>
                {isLive ? 'Live now' : 'Not yet deployed'}
              </span>
            </div>
            <p className="agent-experience">{agent.experience} of experience</p>
            <p className="agent-bio">{agent.bio}</p>

            <div className="agent-expertise">
              {agent.expertise.map((skill) => (
                <span className="agent-tag" key={skill}>
                  {skill}
                </span>
              ))}
            </div>

            <p className="agent-style">
              <strong>Style:</strong> {agent.style}
            </p>
            <p className="agent-style">
              <strong>Communication:</strong> {agent.communication}
            </p>
          </div>
        </div>
        )
      })}
    </div>
  )
}
