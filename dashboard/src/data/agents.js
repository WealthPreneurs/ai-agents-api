// Roster of AI worker personas, keyed by worker_key (matches worker_runs.worker_key).
// To give an agent a real photo, drop an image at public/agents/<id>.jpg — the
// Team page falls back to an initials badge automatically if the file is missing.
export const AGENTS = {
  social_media_manager: {
    id: 'xavier-blake',
    name: 'Xavier Blake',
    title: 'Director of Social Media Strategy',
    experience: '18 years',
    expertise: [
      'Viral Content Creation',
      'Social Media Growth',
      'Community Building',
      'Content Strategy',
      'Platform-Native Execution',
    ],
    style: 'Content visionary, platform native, trend forecaster, community builder, bold and creative.',
    communication:
      'Bold, creative, energetic, trend-forward. Lives on social media and understands platform dynamics.',
    bio: 'Xavier drafts every social post that lands in your Approval Queue. He studies what’s working across platforms right now and writes copy built to earn attention — you approve, edit, or reject before anything goes live.',
  },
}

export function getAgent(workerKey) {
  return AGENTS[workerKey] || null
}
