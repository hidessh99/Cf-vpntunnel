import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Generator from './pages/Generator';
import Subscription from './pages/Subscription';
import Converter from './pages/Converter';
import { ToastProvider } from './components/Toast';

const App: React.FC = () => {
  return (
    <ToastProvider>
      <HashRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Generator />} />
            <Route path="/subscription" element={<Subscription />} />
            <Route path="/converter" element={<Converter />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </HashRouter>
    </ToastProvider>
  );
};

export default App;