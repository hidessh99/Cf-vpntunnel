import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ProxyItem } from '../types';
import { generateUUID, copyToClipboard } from '../utils/common';
import { CONFIG, MAIN_DOMAINS, BUG_LIST } from '../utils/config';
import { generateSingleVlessLink, generateSingleTrojanLink, generateSingleSSLink } from '../utils/generators';
import { useToast } from '../components/Toast';

const ITEMS_PER_PAGE = 20;
const CONCURRENCY_LIMIT = 5; 

const Generator: React.FC = () => {
  const [proxyList, setProxyList] = useState<ProxyItem[]>([]);
  const [filteredList, setFilteredList] = useState<ProxyItem[]>([]);
  const [availableCountries, setAvailableCountries] = useState<string[]>([]);
  
  const [proxyStatusMap, setProxyStatusMap] = useState<Record<string, { status: 'active' | 'dead' | 'loading' | 'unknown', latency: number }>>({});

  const [isLoadingList, setIsLoadingList] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('All');
  
  const [customUrlMode, setCustomUrlMode] = useState(false);
  const [customUrl, setCustomUrl] = useState(CONFIG.proxyListUrl);

  const [selectedProxy, setSelectedProxy] = useState<ProxyItem | null>(null);
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');

  const [activeTab, setActiveTab] = useState<'vless' | 'trojan' | 'ss'>('vless');
  const [formUUID, setFormUUID] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formSecurity, setFormSecurity] = useState<'tls' | 'none'>('tls');
  const [formDomain, setFormDomain] = useState(MAIN_DOMAINS[Math.floor(Math.random() * MAIN_DOMAINS.length)]);
  const [formBug, setFormBug] = useState('');
  const [formManualBug, setFormManualBug] = useState('');
  const [formWildcard, setFormWildcard] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [resultUrl, setResultUrl] = useState('');
  const [resultClash, setResultClash] = useState('');
  const [manualAlias, setManualAlias] = useState<string | null>(null);
  const [isGeneratingQr, setIsGeneratingQr] = useState(false);

  const checkQueue = useRef<ProxyItem[]>([]);
  const activeChecks = useRef(0);
  const mountedRef = useRef(true);

  const { showToast } = useToast();
  const qrRef = useRef<HTMLDivElement>(null);

  const getProxyKey = (p: ProxyItem) => `${p.ip}:${p.port}`;

  useEffect(() => {
    mountedRef.current = true;
    setFormUUID(generateUUID());
    setFormPassword(generateUUID());
    loadProxies(CONFIG.proxyListUrl);
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
      setManualAlias(null);
  }, [selectedProxy]);

  const processCheckQueue = useCallback(async () => {
    if (activeChecks.current >= CONCURRENCY_LIMIT || checkQueue.current.length === 0 || !mountedRef.current) return;

    const batchSize = 10;
    const proxies = checkQueue.current.splice(0, batchSize);
    if (proxies.length === 0) return;

    activeChecks.current++;
    
    setProxyStatusMap(prev => {
        const next = { ...prev };
        let changed = false;
        proxies.forEach(p => {
            const key = getProxyKey(p);
            if (next[key]?.status !== 'active' && next[key]?.status !== 'dead') {
                next[key] = { status: 'loading', latency: 0 };
                changed = true;
            }
        });
        return changed ? next : prev;
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const start = performance.now();

    try {
        const ipList = proxies.map(p => `${p.ip}:${p.port}`).join(',');
        const res = await fetch(`${CONFIG.apiCheckUrl}${ipList}`, { signal: controller.signal });
        clearTimeout(timeoutId);
        const data = await res.json();
        
        const batchLatency = Math.floor(performance.now() - start);
        const results = Array.isArray(data) ? data : [data];

        if (mountedRef.current) {
            setProxyStatusMap(prev => { 
                const next = { ...prev };
                proxies.forEach((p, idx) => {
                    const result = results[idx];
                    const key = getProxyKey(p);
                    
                    if (!result) {
                         next[key] = { status: 'dead', latency: 0 };
                         return;
                    }

                    const isActive = result?.proxyip === true;
                    const latency = result?.latency || batchLatency;

                    next[key] = { status: isActive ? 'active' : 'dead', latency: isActive ? latency : 0 };
                });
                return next;
            });
        }
    } catch {
        if (mountedRef.current) {
            setProxyStatusMap(prev => {
                const next = { ...prev };
                proxies.forEach(p => {
                     next[getProxyKey(p)] = { status: 'dead', latency: 0 };
                });
                return next;
            });
        }
    } finally {
        activeChecks.current--;
        if (mountedRef.current) {
            setTimeout(processCheckQueue, 50);
        }
    }
  }, []);

  useEffect(() => {
    const currentDisplayed = filteredList.slice(
        (currentPage - 1) * ITEMS_PER_PAGE, 
        currentPage * ITEMS_PER_PAGE
    );
    
    const unchecked = currentDisplayed.filter(p => {
        const s = proxyStatusMap[getProxyKey(p)]?.status;
        return !s || s === 'unknown';
    });

    if (unchecked.length > 0) {
        checkQueue.current = [...unchecked];
        for(let i = 0; i < CONCURRENCY_LIMIT; i++) {
            processCheckQueue();
        }
    }
  }, [currentPage, filteredList, processCheckQueue]);

  const loadProxies = async (url: string) => {
    setIsLoadingList(true);
    setProxyStatusMap({});
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load");
      const text = await res.text();
      
      let parsed: ProxyItem[] = [];
      
      try {
        const json = JSON.parse(text);
        if (Array.isArray(json)) {
          parsed = json.map(item => ({
            ip: item.proxy || "",
            port: String(item.port || ""),
            country: item.country || "UNK",
            provider: item.asOrganization || "UNK"
          })).filter(x => x.ip && x.port);
        }
      } catch {
        const lines = text.split(/\r?\n/).filter(x => x.trim());
        parsed = lines.map(line => {
          const parts = line.split(line.includes("\t") ? "\t" : line.includes("|") ? "|" : ",");
          return parts.length >= 2 ? {
            ip: parts[0].trim(),
            port: parts[1].trim(),
            country: parts[2]?.trim() || "UNK",
            provider: parts[3]?.trim() || "UNK"
          } : null;
        }).filter((x): x is ProxyItem => x !== null);
      }
      
      setProxyList(parsed);
      
      const uniqueCountries = Array.from(new Set(parsed.map(p => p.country))).sort();
      setAvailableCountries(['All', ...uniqueCountries]);
      
      applyFilters(parsed, searchQuery, selectedCountry);
    } catch (error) {
      showToast("Failed to load proxy list", "error");
      setProxyList([]);
      setFilteredList([]);
      setAvailableCountries([]);
    } finally {
      setIsLoadingList(false);
    }
  };

  const applyFilters = (list: ProxyItem[], q: string, country: string) => {
    let temp = [...list];
    
    if (country !== 'All') {
        temp = temp.filter(p => p.country === country);
    }

    if (q) {
      const lowerQ = q.toLowerCase();
      temp = temp.filter(p => p.provider.toLowerCase().includes(lowerQ));
    }

    setFilteredList(temp);
    setCurrentPage(1);
  };

  useEffect(() => {
    applyFilters(proxyList, searchQuery, selectedCountry);
  }, [searchQuery, selectedCountry, proxyList]);

  const handleSelectProxy = (p: ProxyItem) => {
    setSelectedProxy(p);
    setMobileView('detail');
    setShowResult(false);
  };

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProxy) return;
    
    const path = CONFIG.pathTemplate.replace("{ip}", selectedProxy.ip).replace("{port}", selectedProxy.port);
    const defaultAlias = `${selectedProxy.country} - ${selectedProxy.provider} [${activeTab.toUpperCase()}-${formSecurity === 'tls' ? 'TLS' : 'NTLS'}]`;
    const serverName = manualAlias !== null ? manualAlias : defaultAlias;
    const encodedName = encodeURIComponent(serverName);
    const encodedPath = encodeURIComponent(path);
    
    let svr = formBug || formDomain;
    if (formBug === 'manual') svr = formManualBug;
    
    const isManual = formBug === 'manual';
    const effectiveBug = isManual ? formManualBug : formBug; 
    
    let host = formDomain;
    let sni = formDomain;

    if (effectiveBug) {
        if (formWildcard && effectiveBug !== 'manual') {
            host = `${effectiveBug}.${formDomain}`;
            sni = host;
        } else {
            host = effectiveBug;
            sni = effectiveBug;
        }
    }

    const port = formSecurity === 'tls' ? 443 : 80;

    let result: { url: string, clash: string } = { url: '', clash: '' };
    
    if (activeTab === 'vless') {
        result = generateSingleVlessLink(formUUID, svr || formDomain, port, formSecurity, host, encodedPath, sni, encodedName);
    } else if (activeTab === 'trojan') {
        result = generateSingleTrojanLink(formPassword, svr || formDomain, port, formSecurity, host, encodedPath, sni, encodedName);
    } else if (activeTab === 'ss') {
        result = generateSingleSSLink(formPassword, svr || formDomain, port, formSecurity, host, encodedPath, sni, encodedName);
    }

    setResultUrl(result.url);
    setResultClash(result.clash);
    setShowResult(true);
    setIsGeneratingQr(true);
    
    setTimeout(() => {
        if (qrRef.current && window.QRCode) {
            qrRef.current.innerHTML = "";
            try {
                new window.QRCode(qrRef.current, {
                    text: result.url,
                    width: 160,
                    height: 160,
                    correctLevel: 1
                });
            } catch (e) {
                // Ignore error
            }
        }
        setIsGeneratingQr(false);
    }, 300);
  };

  const downloadQr = () => {
      if (!qrRef.current) return;
      
      let dataUrl = '';
      const canvas = qrRef.current.querySelector('canvas');
      if (canvas) {
          dataUrl = canvas.toDataURL('image/png');
      } else {
          const img = qrRef.current.querySelector('img');
          if (img) {
              dataUrl = img.src;
          }
      }

      if (dataUrl) {
          const link = document.createElement('a');
          link.href = dataUrl;
          link.download = `QR-${selectedProxy?.provider || 'config'}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          showToast('QR Saved!');
      }
  };

  const totalPages = Math.ceil(filteredList.length / ITEMS_PER_PAGE);
  const displayedProxies = filteredList.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const currentStatus = selectedProxy ? (proxyStatusMap[getProxyKey(selectedProxy)] || { status: 'unknown', latency: 0 }) : { status: 'unknown', latency: 0 };
  const defaultAlias = selectedProxy ? `${selectedProxy.country} - ${selectedProxy.provider} [${activeTab.toUpperCase()}-${formSecurity==='tls'?'TLS':'NTLS'}]` : '';
  const finalAlias = manualAlias !== null ? manualAlias : defaultAlias;

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto w-full h-full flex flex-col">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:h-full lg:min-h-0">

        <div className={`lg:col-span-5 flex flex-col lg:h-full lg:min-h-0 transition-all duration-300 ${mobileView === 'detail' ? 'hidden lg:flex' : 'flex'}`}>
          <div className="gento-card rounded-3xl flex flex-col h-full overflow-hidden">
            
            <div className="p-4 border-b border-white/5 space-y-3 bg-slate-900/40 flex-none">
               <div className="flex gap-2">
                  <div className="relative flex-grow">
                    <i className="fas fa-search absolute left-3 top-3 text-slate-500 text-xs"></i>
                    <input 
                      type="text" 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="gento-input w-full rounded-xl pl-9 pr-3 py-2.5 text-sm placeholder-slate-500"
                      placeholder="Cari Provider..."
                    />
                  </div>
                  
                  <button onClick={() => setCustomUrlMode(!customUrlMode)} className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-all flex-none ${customUrlMode ? 'bg-purple-600 text-white border-purple-500' : 'bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 border-purple-500/30'}`}> 
                    <i className="fas fa-link"></i>
                  </button>
                  <button onClick={() => loadProxies(customUrl)} className="w-10 h-10 rounded-xl bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/30 text-purple-400 flex items-center justify-center transition-all flex-none">
                    <i className="fas fa-sync-alt"></i>
                  </button>
               </div>

               {customUrlMode && (
                   <div className="flex gap-2 animate-fade-in">
                       <input 
                         type="text" 
                         value={customUrl} 
                         onChange={(e) => setCustomUrl(e.target.value)}
                         className="gento-input flex-grow rounded-xl px-3 py-2 text-xs"
                       />
                       <button onClick={() => loadProxies(customUrl)} className="bg-purple-600 text-white px-3 rounded-xl text-xs font-bold">Load</button>
                   </div>
               )}

               <div className="relative group">
                   <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none z-10">
                       <i className="fas fa-globe text-xs"></i>
                   </div>
                   <select 
                     value={selectedCountry} 
                     onChange={(e) => setSelectedCountry(e.target.value)}
                     className="w-full bg-slate-800/50 border border-white/5 hover:border-purple-500/30 text-slate-300 rounded-xl pl-10 pr-8 py-2.5 text-xs font-bold appearance-none cursor-pointer focus:outline-none focus:border-purple-500/50 transition-all shadow-sm"
                   >
                       {availableCountries.map((c) => (
                           <option key={c} value={c} className="bg-slate-900 text-slate-300 py-2">{c === 'All' ? 'Semua Negara' : c}</option>
                       ))}
                   </select>
                   <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                       <i className="fas fa-chevron-down text-xs group-hover:text-purple-400 transition-colors"></i>
                   </div>
               </div>
            </div>

            <div className="relative flex-grow flex flex-col overflow-hidden bg-slate-900/20">
                <div className="flex-grow overflow-y-auto p-3 space-y-2">
                    {displayedProxies.map((p, idx) => {
                        const key = getProxyKey(p);
                        const statusInfo = proxyStatusMap[key] || { status: 'unknown', latency: 0 };
                        const isSelected = selectedProxy && getProxyKey(selectedProxy) === key;
                        
                        return (
                            <div key={idx} onClick={() => handleSelectProxy(p)} className={`p-3 rounded-xl transition-all cursor-pointer border flex justify-between items-center group active:scale-[0.98] ${isSelected ? 'bg-purple-600/10 border-purple-500/30' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}>
                                 <div className="flex items-center gap-3 overflow-hidden flex-grow min-w-0">
                                     <div className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center text-[9px] font-bold border flex-shrink-0 transition-colors ${isSelected ? 'bg-purple-600 text-white border-purple-400' : 'bg-black/30 text-slate-400 border-white/5'}`}>
                                        <span>{p.country}</span>
                                     </div>
                                     <div className="min-w-0 flex-grow">
                                         <h4 className={`text-xs font-bold truncate transition ${isSelected ? 'text-purple-300' : 'text-slate-200 group-hover:text-purple-300'}`}>{p.provider}</h4>
                                         <p className="text-[10px] text-slate-500 font-mono truncate opacity-70">{p.ip}:{p.port}</p>
                                     </div>
                                 </div>

                                 <div className="flex flex-col items-end gap-1.5 flex-shrink-0 pl-2">
                                     <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold border min-w-[50px] justify-center transition-colors ${ 
                                        statusInfo.status === 'active' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                                        statusInfo.status === 'dead' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' :
                                        statusInfo.status === 'loading' ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400' :
                                        'bg-slate-800 border-slate-700 text-slate-500'
                                     }`}>
                                        {statusInfo.status === 'loading' && <><i className="fas fa-circle-notch fa-spin text-[8px]"></i> Check</>}
                                        {statusInfo.status === 'active' && <><i className="fas fa-wifi text-[8px]"></i> {statusInfo.latency}</>}
                                        {statusInfo.status === 'dead' && <span>DEAD</span>}
                                        {statusInfo.status === 'unknown' && <span>WAIT</span>}
                                     </div>
                                 </div>
                            </div>
                        );
                    })}
                    {isLoadingList && Array.from({ length: 8 }).map((_, i) => (
                        <div key={`skeleton-${i}`} className="p-3 rounded-xl border flex justify-between items-center bg-white/5 border-white/5 animate-pulse">
                            <div className="flex items-center gap-3 overflow-hidden flex-grow min-w-0">
                                <div className="w-10 h-10 rounded-lg bg-white/10 flex-shrink-0"></div>
                                <div className="min-w-0 flex-grow space-y-1.5">
                                    <div className="h-3 bg-white/10 rounded w-24"></div>
                                    <div className="h-2 bg-white/10 rounded w-32"></div>
                                </div>
                            </div>
                            <div className="w-12 h-5 bg-white/10 rounded"></div>
                        </div>
                    ))}
                    {!isLoadingList && displayedProxies.length === 0 && (
                         <div className="flex flex-col items-center justify-center py-10 text-slate-500">
                            <i className="fas fa-ghost text-3xl mb-2 opacity-50"></i>
                            <p className="text-xs">Tidak ada data / Tidak ditemukan</p>
                        </div>
                    )}
                </div>
            </div>

            <div className="p-3 border-t border-white/5 bg-slate-900/40 flex-none z-20 relative lg:pb-3">
                 <div className="flex justify-center items-center gap-2">
                     {totalPages > 1 && (
                         <>
                            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className={`w-8 h-8 rounded-lg bg-slate-800 border border-white/5 text-slate-400 flex items-center justify-center ${currentPage === 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-purple-600 hover:text-white'}`}>
                                <i className="fas fa-chevron-left"></i>
                            </button>
                            <span className="text-xs text-slate-500 font-mono mx-2">{currentPage}/{totalPages}</span>
                            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className={`w-8 h-8 rounded-lg bg-slate-800 border border-white/5 text-slate-400 flex items-center justify-center ${currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : 'hover:bg-purple-600 hover:text-white'}`}>
                                <i className="fas fa-chevron-right"></i>
                            </button>
                         </>
                     )}
                 </div>
            </div>
          </div>
        </div>

        <div className={`lg:col-span-7 flex flex-col lg:h-full lg:min-h-0 animate-fade-in-up transition-all duration-300 ${mobileView === 'list' ? 'hidden lg:flex' : 'flex'}`}> 
             
             <div className="gento-card rounded-3xl p-5 mb-4 relative overflow-hidden flex-shrink-0">
                 <div className="absolute -right-6 -top-6 w-32 h-32 bg-purple-600/20 rounded-full blur-3xl"></div>
                 <div className="flex justify-between items-start relative z-10">
                     <div>
                         <h3 className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Selected Server</h3>
                         <div className="flex items-center gap-2">
                             <h2 className="font-display text-lg font-bold text-white truncate max-w-[200px]">
                                 {selectedProxy ? selectedProxy.provider : 'Select Proxy'}
                             </h2>
                             <span className="text-[10px] font-bold px-2 py-0.5 bg-white/10 rounded text-white">
                                 {selectedProxy ? selectedProxy.country : '-'}
                             </span>
                         </div>
                     </div>
                     <button onClick={() => setMobileView('list')} className="lg:hidden w-8 h-8 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center hover:bg-slate-700 border border-white/10">
                         <i className="fas fa-arrow-left"></i>
                     </button>
                 </div>
                 <div className="mt-4 grid grid-cols-2 gap-3 relative z-10">
                     <div className="bg-black/20 rounded-xl p-3 border border-white/5">
                         <div className="text-[10px] text-slate-500 mb-1">IP Address</div>
                         <div className="font-mono text-xs text-teal-400 font-bold">{selectedProxy ? selectedProxy.ip : '-'}</div>
                     </div>
                     <div className="bg-black/20 rounded-xl p-3 border border-white/5">
                         <div className="text-[10px] text-slate-500 mb-1">Live Status</div>
                         <div>
                             {currentStatus.status === 'loading' && <span className="text-xs text-yellow-500 font-bold"><i className="fas fa-spinner fa-spin mr-1"></i> Checking</span>}
                             {currentStatus.status === 'active' && <span className="text-xs text-emerald-400 font-bold"><i className="fas fa-check-circle mr-1"></i> Active ({currentStatus.latency})</span>}
                             {currentStatus.status === 'dead' && <span className="text-xs text-rose-400 font-bold"><i className="fas fa-times-circle mr-1"></i> Dead</span>}
                             {currentStatus.status === 'unknown' && <span className="text-xs text-slate-500 font-bold">Waiting Check...</span>}
                         </div>
                     </div>
                 </div>
             </div>

             {!showResult ? (
                 <div className="gento-card rounded-3xl p-6 flex flex-col flex-grow overflow-y-auto">
                     <div className="grid grid-cols-3 gap-1 p-1 bg-black/20 rounded-2xl mb-6 flex-shrink-0">
                         <button onClick={() => setActiveTab('vless')} className={`py-2.5 rounded-xl text-xs font-bold transition-all ${activeTab === 'vless' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>VLESS</button>
                         <button onClick={() => setActiveTab('trojan')} className={`py-2.5 rounded-xl text-xs font-bold transition-all ${activeTab === 'trojan' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>TROJAN</button>
                         <button onClick={() => setActiveTab('ss')} className={`py-2.5 rounded-xl text-xs font-bold transition-all ${activeTab === 'ss' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>SS</button>
                     </div>

                     <form onSubmit={handleGenerate} className="space-y-4 flex-grow flex flex-col">
                         <div className="space-y-1">
                             <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Username</label>
                             <div className="flex gap-2">
                                <input 
                                  type="text" 
                                  value={finalAlias} 
                                  onChange={(e) => setManualAlias(e.target.value)}
                                  className="gento-input w-full rounded-xl px-4 py-3 text-xs font-bold" 
                                />
                                {manualAlias !== null && (
                                    <button type="button" onClick={() => setManualAlias(null)} className="w-10 bg-white/5 rounded-xl border border-white/10 text-slate-400 hover:text-white flex-none flex items-center justify-center">
                                        <i className="fas fa-undo"></i>
                                    </button>
                                )}
                             </div>
                         </div>

                         {activeTab === 'vless' ? (
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">UUID</label>
                                <div className="flex gap-2">
                                    <input type="text" value={formUUID} onChange={e => setFormUUID(e.target.value)} className="gento-input w-full rounded-xl px-4 py-3 text-xs font-mono text-purple-300" required />
                                    <button type="button" onClick={() => setFormUUID(generateUUID())} className="w-10 bg-white/5 rounded-xl border border-white/10 text-slate-400 hover:text-white"><i className="fas fa-random"></i></button>
                                </div>
                            </div>
                         ) : (
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Password</label>
                                <div className="flex gap-2">
                                    <input type="text" value={formPassword} onChange={e => setFormPassword(e.target.value)} className="gento-input w-full rounded-xl px-4 py-3 text-xs font-mono text-teal-300" required />
                                    <button type="button" onClick={() => setFormPassword(generateUUID())} className="w-10 bg-white/5 rounded-xl border border-white/10 text-slate-400 hover:text-white"><i className="fas fa-random"></i></button>
                                </div>
                            </div>
                         )}

                         <div className="grid grid-cols-2 gap-3">
                             <div className="space-y-1">
                                 <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Security</label>
                                 <select value={formSecurity} onChange={e => setFormSecurity(e.target.value as 'tls' | 'none')} className="gento-input w-full rounded-xl px-3 py-3 text-xs">
                                     <option value="tls">TLS (443)</option>
                                     <option value="none">None (80)</option>
                                 </select>
                             </div>
                             <div className="space-y-1">
                                 <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Domain</label>
                                 <select value={formDomain} onChange={e => setFormDomain(e.target.value)} className="gento-input w-full rounded-xl px-3 py-3 text-xs">
                                     {MAIN_DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
                                 </select>
                             </div>
                         </div>

                         <div className="space-y-1">
                             <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Bug</label>
                             <select value={formBug} onChange={e => setFormBug(e.target.value)} className="gento-input w-full rounded-xl px-4 py-3 text-xs mb-2">
                                 <option value="">Default</option>
                                 <option value="manual">Manual Input</option>
                                 {BUG_LIST.map(b => <option key={b} value={b}>{b}</option>)}
                             </select>
                             {formBug === 'manual' && (
                                 <input type="text" value={formManualBug} onChange={e => setFormManualBug(e.target.value)} placeholder="e.g. bug.com" className="gento-input w-full rounded-xl px-4 py-3 text-xs" />
                             )}
                             {formBug !== '' && formBug !== 'manual' && (
                                 <div className="mt-2 flex items-center gap-2">
                                     <input type="checkbox" id="wildcard" checked={formWildcard} onChange={e => setFormWildcard(e.target.checked)} className="w-4 h-4 rounded bg-white/10 border-white/10 text-purple-600 focus:ring-0" />
                                     <label htmlFor="wildcard" className="text-xs text-slate-400">Wildcard</label>
                                 </div>
                             )}
                         </div>

                         <button type="submit" className={`w-full mt-auto bg-gradient-to-r ${activeTab === 'vless' ? 'from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500' : activeTab === 'trojan' ? 'from-teal-600 to-emerald-600' : 'from-blue-600 to-indigo-600'} text-white font-bold py-4 rounded-xl shadow-lg transition-all transform active:scale-[0.98] mt-auto`}>
                             GENERATE {activeTab.toUpperCase()}
                         </button>
                     </form>
                 </div>
             ) : (
                 <div className="gento-card rounded-3xl p-6 flex flex-col flex-grow overflow-y-auto animate-fade-in">
                     <div className="flex justify-between items-center mb-4 pb-4 border-b border-white/5 flex-shrink-0">
                         <h3 className="font-bold text-emerald-400 flex items-center gap-2"><i className="fas fa-check-circle"></i> Success Created</h3>
                         <button onClick={() => setShowResult(false)} className="text-xs text-slate-400 hover:text-white bg-white/5 px-3 py-1 rounded-lg transition-colors">Edit/Back</button>
                     </div>
                     <div className="space-y-4 pr-1">
                         <div className="flex flex-col items-center gap-3">
                            <div className="bg-white p-4 rounded-2xl flex justify-center w-max shadow-xl relative min-w-[160px] min-h-[160px] group">
                                {isGeneratingQr && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-white z-10 rounded-2xl">
                                        <i className="fas fa-circle-notch fa-spin text-3xl text-slate-800"></i>
                                    </div>
                                )}
                                <div ref={qrRef} className={isGeneratingQr ? 'opacity-0' : 'opacity-100 transition-opacity duration-500'}></div>
                            </div>
                            <button onClick={downloadQr} className="text-xs text-slate-400 hover:text-white flex items-center gap-2 transition-colors">
                                <i className="fas fa-download"></i> Download QR
                            </button>
                         </div>
                         <div className="space-y-2">
                             <div className="flex justify-between items-center"><span className="text-[10px] font-bold text-slate-500 uppercase">V2Ray Link</span><button onClick={() => { copyToClipboard(resultUrl); showToast('Copied!'); }} className="text-xs text-purple-400 hover:text-white"><i className="far fa-copy"></i> Copy</button></div>
                             <div className="gento-input rounded-xl p-3">
                                 <div className="font-mono text-[10px] text-slate-300 break-all max-h-20 overflow-y-auto">{resultUrl}</div>
                             </div>
                         </div>
                         {resultClash && (
                             <div className="space-y-2">
                                 <div className="flex justify-between items-center"><span className="text-[10px] font-bold text-slate-500 uppercase">Clash Config</span><button onClick={() => { copyToClipboard(resultClash); showToast('Copied!'); }} className="text-xs text-purple-400 hover:text-white"><i className="far fa-copy"></i> Copy</button></div>
                                 <div className="gento-input rounded-xl p-3">
                                     <pre className="font-mono text-[10px] text-emerald-300 overflow-x-auto whitespace-pre max-h-32"><code>{resultClash}</code></pre>
                                 </div>
                             </div>
                         )}
                     </div>
                     <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-white/5 flex-shrink-0">
                         <button onClick={() => { setFormUUID(generateUUID()); setFormPassword(generateUUID()); setShowResult(false); }} className="col-span-2 py-3.5 rounded-xl bg-purple-600 text-white text-xs font-bold hover:bg-purple-500 shadow-lg transition-colors">CREATE NEW</button>
                     </div>
                 </div>
             )}
        </div>
      </div>
    </div>
  );
};

export default Generator;
