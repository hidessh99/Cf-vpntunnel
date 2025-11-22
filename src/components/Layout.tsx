import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { CONFIG } from '../utils/config';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();

  const getNavItemClass = (isActive: boolean) => `nav-item px-6 py-2 rounded-full text-xs uppercase tracking-wider ${isActive ? 'active' : ''}`;

  const getMobileNavClass = (path: string) => {
    const isActive = location.pathname === path;
    return `flex flex-col items-center justify-center w-full p-2 rounded-xl transition-colors duration-200 ${
      isActive ? 'bg-purple-600/20 text-purple-400' : 'text-slate-500 hover:text-white'
    }`;
  };

  return (
    <div className="flex flex-col w-full min-h-[100dvh] lg:h-[100dvh] lg:overflow-hidden relative bg-[#020617]">
      <div className="ambient-light"></div>

      <header className="hidden lg:block flex-none z-50 w-full backdrop-blur-xl bg-slate-900/70 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-16 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-teal-400 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <i className="fas fa-bolt text-white text-sm"></i>
            </div>
            <h1 className="font-display font-bold text-xl text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-teal-400">
              {CONFIG.webName}
            </h1>
          </div>
          <div className="flex gap-1 bg-slate-800/50 p-1 rounded-full border border-white/5 backdrop-blur-md">
            <NavLink to="/" className={({ isActive }) => getNavItemClass(isActive)}>Generator</NavLink>
            <NavLink to="/subscription" className={({ isActive }) => getNavItemClass(isActive)}>Subscription</NavLink>
            <NavLink to="/converter" className={({ isActive }) => getNavItemClass(isActive)}>Converter</NavLink>
          </div>
        </div>
      </header>

      <header className="lg:hidden flex-none z-50 backdrop-blur-md bg-slate-900/80 border-b border-white/5 px-4 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-teal-400 flex items-center justify-center">
            <i className={`fas ${location.pathname === '/subscription' ? 'fa-rss' : location.pathname === '/converter' ? 'fa-exchange-alt' : 'fa-bolt'} text-white text-xs`}></i>
          </div>
          <h1 className="font-display font-bold text-lg text-white">
            {CONFIG.webName}
          </h1>
        </div>
      </header>

      <main className="w-full flex-grow relative lg:flex lg:min-h-0 pb-24 lg:pb-0">
        {children}
      </main>

      <nav className="lg:hidden fixed bottom-4 left-4 right-4 z-50">
        <div className="gento-card rounded-2xl px-2 py-2 flex justify-around items-center shadow-2xl bg-slate-900/95 backdrop-blur-xl border border-white/10">
          <NavLink to="/" className={() => getMobileNavClass('/')}>
            <i className="fas fa-bolt text-lg mb-0.5"></i>
            <span className="text-[10px] font-bold">Gen</span>
          </NavLink>
          <NavLink to="/subscription" className={() => getMobileNavClass('/subscription')}>
            <i className="fas fa-rss text-lg mb-0.5"></i>
            <span className="text-[10px] font-bold">Sub</span>
          </NavLink>
          <NavLink to="/converter" className={() => getMobileNavClass('/converter')}>
            <i className="fas fa-exchange-alt text-lg mb-0.5"></i>
            <span className="text-[10px] font-bold">Conv</span>
          </NavLink>
        </div>
      </nav>
    </div>
  );
};

export default Layout;
