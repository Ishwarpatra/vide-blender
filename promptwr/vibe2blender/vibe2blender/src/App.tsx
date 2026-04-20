import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { MainPage } from './pages/MainPage';
import { LoginPage } from './auth/LoginPage';
import { SignupPage } from './auth/SignupPage';
import './Main.css';

export function App() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white" style={{ backgroundColor: '#0a0a0a', color: 'white' }}>
      {/* Debug Marker */}
      <div className="absolute top-0 right-0 p-2 text-[8px] opacity-50 z-50">V2B_DEBUG_MODE</div>
      
      <Routes>
        <Route path="/" element={<MainPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/200.html" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
