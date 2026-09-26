// Shown instead of the app when the build is missing required settings,
// so a misconfigured deploy explains itself rather than rendering a blank page.
export default function ConfigError({ missing }) {
  return (
    <div className="login-wrap">
      <h2>Setup needed</h2>
      <p>This build of the dashboard is missing required settings:</p>
      <ul>
        {missing.map((name) => (
          <li key={name}>
            <code>{name}</code>
          </li>
        ))}
      </ul>
      <p className="page-subtitle">
        Add them in your host's environment variables (Vercel: Project → Settings → Environment Variables, enabled
        for Production), then redeploy. Values come from Supabase → Project Settings → API. For local development,
        copy <code>.env.example</code> to <code>.env</code>.
      </p>
    </div>
  )
}
