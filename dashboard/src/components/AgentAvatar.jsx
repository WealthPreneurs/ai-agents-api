import { useState } from 'react'

function initialsOf(name) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

export default function AgentAvatar({ agent, size = 96 }) {
  const [imgFailed, setImgFailed] = useState(false)
  const src = `/agents/${agent.id}.jpg`

  if (imgFailed) {
    return (
      <div
        className="agent-avatar agent-avatar-fallback"
        style={{ width: size, height: size, fontSize: size * 0.36 }}
      >
        {initialsOf(agent.name)}
      </div>
    )
  }

  return (
    <img
      className="agent-avatar"
      style={{ width: size, height: size }}
      src={src}
      alt={agent.name}
      onError={() => setImgFailed(true)}
    />
  )
}
