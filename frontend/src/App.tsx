import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { EarthPage } from './pages/EarthPage'

function App() {
  return (
    <BrowserRouter>
      <div className="w-screen h-screen bg-black overflow-hidden font-sans">
        <Routes>
          <Route path="/" element={<EarthPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
