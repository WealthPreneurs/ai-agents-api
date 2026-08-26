import { AGENTS } from '../data/agents'
import AgentAvatar from '../components/AgentAvatar'

export default function YourTeam() {
  const agents = Object.values(AGENTS)

  return (
    <div>
      <h2>Your Team</h2>
      <p className="page-subtitle">
        Meet the AI workers behind your drafts. Each one specializes in a
        different part of running your business — approve, edit, or reject
        their work from the Approval Queue.
      </p>

      {agents.map((agent) => (
        <div className="card agent-card" key={agent.id}>
          <AgentAvatar agent={agent} />
          <div className="agent-card-body">
            <div className="agent-card-header">
              <h3>{agent.name}</h3>
              <span className="agent-title">{agent.title}</span>
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
      ))}
    </div>
  )
}
