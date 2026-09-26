import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ConfigError from './components/ConfigError.jsx'
import { missingConfig } from './lib/supabaseClient'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {missingConfig.length ? <ConfigError missing={missingConfig} /> : <App />}
  </React.StrictMode>
)
