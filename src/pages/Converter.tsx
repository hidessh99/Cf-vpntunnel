import React, { useState } from 'react';
import { parseV2rayLink } from '../utils/parsers';
import { useToast } from '../components/Toast';
import { V2RayConfig } from '../types';

const Converter: React.FC = () => {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const [isFullConfig, setIsFullConfig] = useState(false);
  const [customServerMode, setCustomServerMode] = useState(false);
  const [customServerInput, setCustomServerInput] = useState('');
  const [isWildcard, setIsWildcard] = useState(false);
  const [isFakeIp, setIsFakeIp] = useState(true);
  const [bestPing, setBestPing] = useState(false);
  const [loadBalance, setLoadBalance] = useState(false);
  const [fallback, setFallback] = useState(false);

  const { showToast } = useToast();

  const handleConvert = () => {
    if (!input.trim()) {
        showToast("Input empty!", "error");
        return;
    }
    setIsLoading(true);
    setError('');
    
    setTimeout(() => {
        try {
            const links = input.split(/\r?\n/).filter(l => l.trim() !== "");
            if (!links.length) throw new Error("No valid links");
            
            const parsed = links.map(link => {
                try {
                    return parseV2rayLink(link);
                } catch {
                    return null;
                }
            }).filter((p): p is V2RayConfig => p !== null);

            if (parsed.length === 0) throw new Error("No valid V2Ray links found");

            if (customServerMode && customServerInput.trim()) {
                parsed.forEach(l => {
                    const oS = l.sni || "";
                    const oH = l.wsHost || "";
                    const oSv = l.server;
                    const custVal = customServerInput.trim();
                    
                    l.server = custVal;
                    if (isWildcard) {
                        const tgt = (oS && oS !== oSv) ? oS : (oH && oH !== oSv) ? oH : oSv;
                        const nH = `${custVal}.${tgt}`;
                        l.sni = nH;
                        l.wsHost = nH;
                    } else {
                         l.sni = (oS && oS !== oSv) ? oS : custVal;
                         l.wsHost = (oH && oH !== oSv) ? oH : custVal;
                    }
                });
            }
            
            let c = "# Clash Config\n# Created: " + new Date().toISOString() + "\n";
            if (isFullConfig) {
                c += `port: 7890\nsocks-port: 7891\nallow-lan: true\nmode: rule\nlog-level: silent\nexternal-controller: 0.0.0.0:9090\ndns:\n  enable: true\n  ipv6: false\n  listen: 0.0.0.0:7874\n  enhanced-mode: ${isFakeIp?'fake-ip':'redir-host'}\n  nameserver:\n    - 8.8.8.8\n    - 1.1.1.1\nproxies:\n`;
            } else c += `proxies:\n`;

            const names: string[] = [];
            parsed.forEach((p, i) => {
                const n = `[${i+1}]-${p.name.replace(/["']/g,"")}`;
                names.push(n);
                let entry = `  - name: "${n}"\n    type: ${p.type}\n    server: ${p.server}\n    port: ${p.port}\n    udp: true\n    skip-cert-verify: true\n`;
                if (p.tls) {
                    entry += `    tls: true\n    servername: ${p.sni}\n`;
                }

                if (p.type === 'vmess') entry += `    uuid: ${p.uuid}\n    alterId: ${p.alterId}\n    cipher: ${p.cipher}\n`;
                else if (p.type === 'vless') entry += `    uuid: ${p.uuid}\n`;
                else if (p.type === 'trojan') entry += `    password: ${p.password}\n`;
                else if (p.type === 'ss') entry += `    cipher: ${p.cipher}\n    password: ${p.password}\n    plugin: v2ray-plugin\n    plugin-opts:\n      mode: websocket\n      tls: ${p.tls}\n      skip-cert-verify: true\n      host: ${p.wsHost}\n      path: "${p.wsPath}"\n      mux: false\n`;

                if (p.type !== 'ss') {
                    if (p.network === 'ws') entry += `    network: ws\n    ws-opts:\n      path: "${p.wsPath}"\n      headers:\n        Host: ${p.wsHost}\n`;
                    else if (p.network === 'grpc') entry += `    network: grpc\n    grpc-opts:\n      grpc-service-name: "${p.serviceName}"\n`;
                }
                c += entry;
            });

            if (isFullConfig) {
                c += `proxy-groups:\n  - name: "INCONIGTO-MODE"\n    type: select\n    proxies:\n      - SELECTOR\n`;
                if (bestPing) c += `      - BEST-PING\n`;
                if (loadBalance) c += `      - LOAD-BALANCE\n`;
                if (fallback) c += `      - FALLBACK\n`;
                c += `      - DIRECT\n      - REJECT\n`;
                c += `  - name: "SELECTOR"\n    type: select\n    proxies:\n      - DIRECT\n      - REJECT\n`;
                names.forEach(n => c += `      - "${n}"\n`);
                if (bestPing) {
                    c += `  - name: "BEST-PING"\n    type: url-test\n    url: http://www.gstatic.com/generate_204\n    interval: 300\n    proxies:\n`;
                    names.forEach(n => c += `      - "${n}"\n`);
                }
                if (loadBalance) {
                    c += `  - name: "LOAD-BALANCE"\n    type: load-balance\n    url: http://www.gstatic.com/generate_204\n    interval: 300\n    proxies:\n`;
                    names.forEach(n => c += `      - "${n}"\n`);
                }
                if (fallback) {
                    c += `  - name: "FALLBACK"\n    type: fallback\n    url: http://www.gstatic.com/generate_204\n    interval: 300\n    proxies:\n`;
                    names.forEach(n => c += `      - "${n}"\n`);
                }
                c += `rules:\n  - MATCH,INCONIGTO-MODE\n`;
            }
            
            setOutput(c);
            showToast("Success!", "success");
        } catch (e: any) {
            setError(e.message);
            showToast("Conversion failed", "error");
        }
        setIsLoading(false);
    }, 50);
  };

  const downloadConfig = () => {
      if (!output) return;
      const blob = new Blob([output], { type: "text/yaml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = isFullConfig ? `clash_${Date.now()}.yaml` : `proxy_${Date.now()}.yaml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("Downloaded!");
  };

  return (
    <div className="w-full h-full flex flex-col">
        <div className="flex-grow lg:overflow-y-auto custom-scroll">
            <div className="max-w-7xl mx-auto p-4 lg:p-6 w-full flex flex-col lg:flex-row gap-6 h-full">

                <div className="flex-1 flex flex-col lg:h-full min-h-[500px] lg:min-h-0 gento-card rounded-3xl p-5 lg:p-6 transition-all">
                    <div className="flex items-center gap-2 mb-4 flex-shrink-0">
                        <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                             <i className="fas fa-code text-purple-400 text-sm"></i>
                        </div>
                        <h2 className="text-lg font-bold text-white">Input Config</h2>
                    </div>

                    <textarea 
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      className="gento-input w-full flex-1 rounded-xl p-4 text-xs font-mono text-slate-300 resize-none mb-4 focus:ring-2 focus:ring-purple-500/50 border-white/10 shadow-inner" 
                      placeholder="Paste vmess://, vless://, trojan://, ss:// links here..."
                      spellCheck={false}
                    ></textarea>

                    <div className="flex-shrink-0 space-y-4">
                        <div className="bg-black/20 p-4 rounded-xl border border-white/5 space-y-3">
                            <div className="flex bg-black/30 rounded-lg p-1 border border-white/5">
                                <button 
                                  onClick={() => setIsFullConfig(false)} 
                                  className={`flex-1 py-2 rounded-md text-xs font-bold transition-all duration-200 ${!isFullConfig ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                                >Minimal</button>
                                <button 
                                  onClick={() => setIsFullConfig(true)} 
                                  className={`flex-1 py-2 rounded-md text-xs font-bold transition-all duration-200 ${isFullConfig ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                                >Full Rules</button>
                            </div>

                            <button 
                              onClick={() => setCustomServerMode(!customServerMode)}
                              className={`w-full py-2.5 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 transition-all ${customServerMode ? 'bg-white/10 border-white/20 text-white' : 'border-white/10 text-slate-400 hover:bg-white/5'}`}
                            >
                                <i className="fas fa-server"></i> Custom Server / Bug
                            </button>

                            {customServerMode && (
                                <div className="space-y-2 animate-fade-in">
                                    <input 
                                      type="text" 
                                      value={customServerInput}
                                      onChange={e => setCustomServerInput(e.target.value)}
                                      className="gento-input w-full rounded-lg px-3 py-2.5 text-xs text-white" 
                                      placeholder="e.g. bug.com" 
                                    />
                                    <div className="flex gap-2">
                                        <button onClick={() => setIsWildcard(false)} className={`flex-1 py-1.5 rounded text-[10px] font-bold transition-colors ${!isWildcard ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-400 border border-white/5'}`}>Non-Wildcard</button>
                                        <button onClick={() => setIsWildcard(true)} className={`flex-1 py-1.5 rounded text-[10px] font-bold transition-colors ${isWildcard ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-400 border border-white/5'}`}>Wildcard</button>
                                    </div>
                                </div>
                            )}

                            {isFullConfig && (
                                <div className="pt-3 border-t border-white/10 grid grid-cols-2 gap-2 animate-fade-in">
                                    <button onClick={() => setIsFakeIp(true)} className={`py-1.5 rounded text-[10px] font-bold border transition-colors ${isFakeIp ? 'bg-indigo-600/50 border-indigo-500 text-white' : 'bg-slate-800 border-white/5 text-slate-400'}`}>Fake-IP</button>
                                    <button onClick={() => setIsFakeIp(false)} className={`py-1.5 rounded text-[10px] font-bold border transition-colors ${!isFakeIp ? 'bg-indigo-600/50 border-indigo-500 text-white' : 'bg-slate-800 border-white/5 text-slate-400'}`}>Redir-Host</button>
                                    <div className="col-span-2 grid grid-cols-3 gap-2 mt-1">
                                        <button onClick={() => setBestPing(!bestPing)} className={`py-1.5 rounded text-[10px] font-bold border transition-colors ${bestPing ? 'bg-emerald-600/40 border-emerald-500 text-emerald-100' : 'bg-slate-800 border-white/5 text-slate-400'}`}>Best-Ping</button>
                                        <button onClick={() => setLoadBalance(!loadBalance)} className={`py-1.5 rounded text-[10px] font-bold border transition-colors ${loadBalance ? 'bg-emerald-600/40 border-emerald-500 text-emerald-100' : 'bg-slate-800 border-white/5 text-slate-400'}`}>Load-Bal</button>
                                        <button onClick={() => setFallback(!fallback)} className={`py-1.5 rounded text-[10px] font-bold border transition-colors ${fallback ? 'bg-emerald-600/40 border-emerald-500 text-emerald-100' : 'bg-slate-800 border-white/5 text-slate-400'}`}>Fallback</button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <button onClick={handleConvert} className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-purple-600/20 transition-all hover:scale-[1.02] active:scale-[0.98]">
                            CONVERT TO CLASH <i className="fas fa-arrow-right ml-1"></i>
                        </button>
                    </div>
                </div>

                <div className="flex-1 flex flex-col lg:h-full min-h-[500px] lg:min-h-0 gento-card rounded-3xl p-5 lg:p-6 relative overflow-hidden">
                    <div className="flex justify-between items-center mb-4 flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-teal-500/20 flex items-center justify-center">
                                <i className="fas fa-file-code text-teal-400 text-sm"></i>
                            </div>
                            <h2 className="text-lg font-bold text-white">Result</h2>
                        </div>
                        <button onClick={() => { 
                            if(!output) return;
                            const ta = document.createElement('textarea');
                            ta.value = output;
                            document.body.appendChild(ta);
                            ta.select();
                            document.execCommand('copy');
                            document.body.removeChild(ta);
                            showToast("Copied!");
                        }} className="text-xs bg-white/10 px-4 py-2 rounded-lg hover:bg-white/20 border border-white/5 font-bold transition-colors">
                            <i className="far fa-copy mr-1"></i> Copy
                        </button>
                    </div>

                    {error && (
                        <div className="p-3 mb-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 animate-fade-in flex items-center gap-2 flex-shrink-0">
                            <i className="fas fa-exclamation-triangle"></i> {error}
                        </div>
                    )}

                    <textarea 
                      value={output}
                      readOnly
                      className="gento-input w-full flex-1 rounded-xl p-4 text-[11px] font-mono text-teal-300 resize-none custom-scroll focus:ring-2 focus:ring-teal-500/50 border-white/10 leading-relaxed shadow-inner" 
                      placeholder="YAML Output will appear here..."
                      spellCheck={false}
                    ></textarea>

                    <div className="mt-4 flex-shrink-0">
                        <button 
                          onClick={downloadConfig} 
                          disabled={!output}
                          className={`w-full py-3.5 rounded-xl font-bold text-xs border transition-all flex items-center justify-center gap-2 ${output ? 'bg-teal-600/20 border-teal-500/50 text-teal-400 hover:bg-teal-600/30 cursor-pointer' : 'bg-slate-800 border-white/5 text-slate-500 cursor-not-allowed'}`}
                        >
                            <i className="fas fa-download"></i> {isFullConfig ? 'Download Full Config' : 'Download Minimal Config'}
                        </button>
                    </div>

                    {isLoading && (
                        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm flex flex-col items-center justify-center z-20 animate-fade-in">
                            <i className="fas fa-circle-notch fa-spin text-3xl text-purple-500 mb-3"></i>
                            <span className="text-sm font-bold text-white">Processing...</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    </div>
  );
};

export default Converter;
