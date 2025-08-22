import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './test-auth.ts'
import './utils/setupDatabase.ts'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)