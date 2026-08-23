// Temporary diagnostic endpoint: reports whether JOTFORM_API_KEY is visible
// to Netlify Functions in this deploy context, without exposing its value.
// Safe to hit directly in a browser. Delete once the Jotform integration
// is confirmed working.
exports.handler = async () => {
  const key = process.env.JOTFORM_API_KEY || '';
  const jotformVars = Object.keys(process.env).filter((k) => k.startsWith('JOTFORM'));
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      JOTFORM_API_KEY_present: key.length > 0,
      JOTFORM_API_KEY_length: key.length,
      jotform_env_var_names_visible: jotformVars,
      deploy_context: process.env.CONTEXT || 'unknown',
      is_netlify_runtime: process.env.NETLIFY || 'unknown',
      site_name: process.env.SITE_NAME || 'unknown',
      deploy_id: process.env.DEPLOY_ID || 'unknown',
      total_env_var_count: Object.keys(process.env).length
    })
  };
};
