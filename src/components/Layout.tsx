import React from 'react';
import { NavLink } from 'react-router-dom';
import { CONFIG } from '../utils/config';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {

  const getNavItemClass = (isActive: boolean) => `nav-item px-6 py-2 rounded-full text-xs uppercase tracking-wider ${isActive ? 'active' : ''}`;

  return (
    <div className="flex flex-col w-full min-h-[100dvh] lg:h-[100dvh] lg:overflow-hidden relative bg-[#050712] text-slate-100">
      <div className="ambient-light" />

      <header className="flex-none z-50 w-full">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 pt-5 pb-4">
          <div className="flex items-center justify-between bg-gradient-to-r from-slate-900/80 via-slate-900/70 to-slate-900/60 border border-white/5 rounded-2xl px-4 lg:px-6 py-3 backdrop-blur-xl shadow-lg shadow-purple-900/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500 via-fuchsia-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-cyan-500/30 ring-1 ring-white/10">
                <i className="fas fa-bolt text-white text-sm"></i>
              </div>
              <div>
                <p className="pill text-[10px] text-cyan-200/80">modern panel</p>
                <h1 className="font-display font-bold text-xl text-transparent bg-clip-text bg-gradient-to-r from-purple-300 via-cyan-200 to-emerald-200">
                  {CONFIG.webName}
                </h1>
              </div>
            </div>
            <div className="hidden lg:flex gap-1 bg-slate-800/60 p-1 rounded-full border border-white/5 backdrop-blur-md">
              <NavLink to="/" className={({ isActive }) => getNavItemClass(isActive)}>Generator</NavLink>
            </div>
            <div className="lg:hidden pill text-[11px] text-slate-300">Secure Proxy Tools</div>
          </div>
        </div>
      </header>

      <main className="w-full flex-grow relative lg:flex lg:min-h-0">
        {children}
      </main>
    </div>
  );
};

export default Layout;
