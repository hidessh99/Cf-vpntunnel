import React, { useState, useEffect } from 'react';
import { ProxyItem, V2RayConfig } from '../types';
import { generateUUID, copyToClipboard } from '../utils/common';
import { CONFIG, MAIN_DOMAINS } from '../utils/config';
import { useToast } from '../components/Toast';

const Subscription: React.FC = () => {
  const [proxyList, setProxyList] = useState<ProxyItem[]>([]);
  const [configType, setConfigType] = useState('vless');
  const [formatType, setFormatType] = useState('v2ray');
  const [uuid, setUuid] = useState('');
  const [bugType, setBugType] = useState('default');
  const [mainDomain, setMainDomain] = useState(MAIN_DOMAINS[Math.floor(Math.random() * MAIN_DOMAINS.length)]);
  const [customBug, setCustomBug] = useState('');
  const [tls, setTls] = useState('true');
  const [country, setCountry] = useState('');
  const [limit, setLimit] = useState(5);
  const [validateProxies, setValidateProxies] = useState(false);
  const [countries, setCountries] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [result, setResult] = useState('');
  const [showResult, setShowResult] = useState(false);

  const [validationStatus, setValidationStatus] = useState({
    total: 0,
    current: 0,
    valid: 0,
    invalid: 0,
    show: false
  });

  const { showToast } = useToast();

  useEffect(() => {
    setUuid(generateUUID());
    fetchProxies();
  }, []);

const fetchProxies = async () => {
  try {
    const res = await fetch(CONFIG.proxyListUrl);
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
    setCountries([...new Set(parsed.map(p => p.country))].sort());
  } catch {
    showToast("Failed to fetch proxies", "error");
  }
};

  const checkProxyStatus = async (proxy: ProxyItem): Promise<boolean> => {
      try {
          for (let i = 0; i < 2; i++) {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 4000);
              try {
                  const res = await fetch(`${CONFIG.apiCheckUrl}${proxy.ip}:${proxy.port}`, { signal: controller.signal });
                  clearTimeout(timeoutId);
                  const data = await res.json();
                  if ((Array.isArray(data) ? data[0] : data)?.proxyip === true) return true;
              } catch (e) {
                  if (i === 1) return false;
                  await new Promise(r => setTimeout(r, 500));
              }
          }
          return false;
      } catch {
          return false;
      }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setShowResult(false);

    if (!uuid) return setErrorMessage("UUID required");
    if (limit < 1 || limit > 50) return setErrorMessage("Limit 1-50");

    let filtered = country ? proxyList.filter(p => p.country === country) : [...proxyList];
    if (!filtered.length) return setErrorMessage("No proxies found");

    for (let i = filtered.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [filtered[i], filtered[j]] = [filtered[j], filtered[i]];
    }
    filtered = filtered.slice(0, limit);

    setLoading(true);

    if (validateProxies) {
        setValidationStatus({ total: filtered.length, current: 0, valid: 0, invalid: 0, show: true });
        const validProxies: ProxyItem[] = [];
        const batchSize = 5;
        for (let i = 0; i < filtered.length; i += batchSize) {
            const chunk = filtered.slice(i, i + batchSize);
            await Promise.all(chunk.map(async (p) => {
                const ok = await checkProxyStatus(p);
                setValidationStatus(prev => ({
                    ...prev,
                    current: prev.current + 1,
                    valid: prev.valid + (ok ? 1 : 0),
                    invalid: prev.invalid + (ok ? 0 : 1)
                }));
                if (ok) validProxies.push(p);
            }));
        }
        filtered = validProxies;
    }

    if (!filtered.length) {
        setLoading(false);
        setErrorMessage("No valid proxies found after check");
        return;
    }

    const isTls = tls === 'true';
    const bugs = (customBug && (bugType !== "default")) ? customBug.split(",").map(s => s.trim()) : [mainDomain];
    
    let output = "";

    if (formatType === 'clash') {
        const configs: V2RayConfig[] = [];
        filtered.forEach((p, idx) => {
            const path = CONFIG.pathTemplate.replace("{ip}", p.ip).replace("{port}", p.port);
            const port = isTls ? 443 : 80;
            bugs.forEach((b, bi) => {
                 const h = (bugType === "wildcard") ? `${b}.${mainDomain}` : mainDomain;
                 const sni = h;
                 const svr = (bugType === "non-wildcard") ? b : mainDomain;
                 const n = `${p.country} ${p.provider}`;
                 
                 if (configType === 'mix' || configType === 'trojan') configs.push({
                     type: 'trojan', name: `${n} [TR]`, server: svr, port, password: uuid, tls: isTls, sni, skipCertVerify: true, network: 'ws', wsHost: h, wsPath: path
                 });
                 if (configType === 'mix' || configType === 'vless') configs.push({
                     type: 'vless', name: `${n} [VL]`, server: svr, port, uuid, tls: isTls, sni: sni, skipCertVerify: true, network: 'ws', wsHost: h, wsPath: path
                 });
                 if (configType === 'mix' || configType === 'shadowsocks') configs.push({
                     type: 'ss', name: `${n} [SS]`, server: svr, port, password: uuid, cipher: 'none', tls: isTls, sni, skipCertVerify: true, network: 'ws', wsHost: h, wsPath: path
                 });
            });
        });
        
        let c = `# Clash Proxy Provider\nproxies:\n`;
        configs.forEach((p, i) => {
             let entry = `  - name: "${p.name}"\n    type: ${p.type}\n    server: ${p.server}\n    port: ${p.port}\n`;
             if (p.type === 'trojan') entry += `    password: ${p.password}\n    udp: false\n    sni: ${p.sni}\n    skip-cert-verify: true\n    network: ws\n    ws-opts:\n      path: "${p.wsPath}"\n      headers:\n        Host: ${p.wsHost}\n`;
             if (p.type === 'vless') entry += `    uuid: ${p.uuid}\n    udp: false\n    tls: ${p.tls}\n    skip-cert-verify: true\n    servername: ${p.sni}\n    network: ws\n    ws-opts:\n      path: "${p.wsPath}"\n      headers:\n        Host: ${p.wsHost}\n`;
             if (p.type === 'ss') entry += `    cipher: none\n    password: ${p.password}\n    udp: false\n    plugin: v2ray-plugin\n    plugin-opts:\n      mode: websocket\n      tls: ${p.tls}\n      skip-cert-verify: true\n      host: ${p.wsHost}\n      path: "${p.wsPath}"\n      mux: false\n`;
             c += entry;
        });
        output = c;

    } else if (formatType === 'nekobox') {
        const pl: any[] = [];
         filtered.forEach(p => {
            const path = CONFIG.pathTemplate.replace("{ip}", p.ip).replace("{port}", p.port);
            const port = isTls ? 443 : 80;
            bugs.forEach(b => {
                const h = (bugType === "wildcard") ? `${b}.${mainDomain}` : (bugType === "non-wildcard" ? b : mainDomain);
                const sni = h;
                const svr = (bugType === "non-wildcard") ? b : mainDomain;
                const n = `(${p.country}) ${p.provider}`;
                
                if (configType === 'trojan' || configType === 'mix') pl.push({ type: "trojan", name: `${n} [TR]`, server: svr, port, password: uuid, tls: isTls, sni, wsHost: h, wsPath: path });
                if (configType === 'vless' || configType === 'mix') pl.push({ type: "vless", name: `${n} [VL]`, server: svr, port, uuid, tls: isTls, sni, wsHost: h, wsPath: path });
                if (configType === 'shadowsocks' || configType === 'mix') pl.push({ type: "ss", name: `${n} [SS]`, server: svr, port, password: uuid, tls: isTls, wsHost: h, wsPath: path });
            });
        });

        const jsonStr = {
            "dns": {
                "final": "dns-final", "independent_cache": true,
                "rules": [{"disable_cache": false, "domain": ["family.cloudflare-dns.com"], "server": "direct-dns"}],
                "servers": [{"address": "https://family.cloudflare-dns.com/dns-query", "address_resolver": "direct-dns", "strategy": "ipv4_only", "tag": "remote-dns"}, {"address": "local", "strategy": "ipv4_only", "tag": "direct-dns"}, {"address": "local", "address_resolver": "dns-local", "strategy": "ipv4_only", "tag": "dns-final"}, {"address": "local", "tag": "dns-local"}, {"address": "rcode://success", "tag": "dns-block"}]
            },
            "inbounds": [{"listen": "0.0.0.0", "listen_port": 6450, "override_address": "8.8.8.8", "override_port": 53, "tag": "dns-in", "type": "direct"}, {"domain_strategy": "", "endpoint_independent_nat": true, "inet4_address": ["172.19.0.1/28"], "mtu": 9000, "sniff": true, "sniff_override_destination": true, "stack": "system", "tag": "tun-in", "type": "tun"}, {"domain_strategy": "", "listen": "0.0.0.0", "listen_port": 2080, "sniff": true, "sniff_override_destination": true, "tag": "mixed-in", "type": "mixed"}],
            "outbounds": [
                { "outbounds": ["Best Latency", ...pl.map(p=>p.name), "direct"], "tag": "Internet", "type": "selector" },
                { "interval": "1m0s", "outbounds": [...pl.map(p=>p.name), "direct"], "tag": "Best Latency", "type": "urltest", "url": "https://detectportal.firefox.com/success.txt" },
                ...pl.map(p => {
                     if(p.type === 'trojan') return { "domain_strategy": "ipv4_only", "multiplex": {"enabled": false, "max_streams": 32, "protocol": "smux"}, "password": p.password, "server": p.server, "server_port": p.port, "tag": p.name, "tls": {"enabled": p.tls, "insecure": false, "server_name": p.sni, "utls": {"enabled": true, "fingerprint": "randomized"}}, "transport": {"early_data_header_name": "Sec-WebSocket-Protocol", "headers": {"Host": p.wsHost}, "max_early_data": 0, "path": p.wsPath, "type": "ws"}, "type": "trojan" };
                     if(p.type === 'vless') return { "domain_strategy": "ipv4_only", "flow": "", "multiplex": {"enabled": false, "max_streams": 32, "protocol": "smux"}, "packet_encoding": "xudp", "server": p.server, "server_port": p.port, "tag": p.name, "tls": {"enabled": p.tls, "insecure": false, "server_name": p.sni, "utls": {"enabled": true, "fingerprint": "randomized"}}, "transport": {"early_data_header_name": "Sec-WebSocket-Protocol", "headers": {"Host": p.wsHost}, "max_early_data": 0, "path": p.wsPath, "type": "ws"}, "type": "vless", "uuid": p.uuid };
                     if(p.type === 'ss') return { "type": "shadowsocks", "tag": p.name, "server": p.server, "server_port": p.port, "method": "none", "password": p.password, "plugin": "v2ray-plugin", "plugin_opts": `mux=0;path=${p.wsPath};host=${p.wsHost};tls=${p.tls?1:0}` };
                     return {};
                }),
                {"tag": "direct", "type": "direct"}, {"tag": "bypass", "type": "direct"}, {"tag": "block", "type": "block"}, {"tag": "dns-out", "type": "dns"}
            ],
            "route": {"auto_detect_interface": true, "rules": [{"outbound": "dns-out", "port": [53]}, {"inbound": ["dns-in"], "outbound": "dns-out"}, {"network": ["udp"], "outbound": "block", "port": [443]}, {"ip_cidr": ["224.0.0.0/3", "ff00::/8"], "outbound": "block", "source_ip_cidr": ["224.0.0.0/3", "ff00::/8"]}]}
        };
        output = JSON.stringify(jsonStr, null, 2);
    } else {
        const links: string[] = [];
        filtered.forEach((p, i) => {
            const path = CONFIG.pathTemplate.replace("{ip}", p.ip).replace("{port}", p.port);
            const port = isTls ? 443 : 80;
            bugs.forEach(b => {
                const h = (bugType === "wildcard") ? `${b}.${mainDomain}` : mainDomain;
                const s = (bugType === "wildcard") ? `${b}.${mainDomain}` : mainDomain;
                const svr = (bugType === "non-wildcard") ? b : mainDomain;
                const n = encodeURIComponent(`${p.country} ${p.provider}`);
                const ep = encodeURIComponent(path);
                
                if (configType === 'mix' || configType === 'trojan') links.push(`trojan://${uuid}@${svr}:${port}?security=${isTls?'tls':'none'}&type=ws&host=${h}&path=${ep}&sni=${s}#${n}%20[TR]`);
                if (configType === 'mix' || configType === 'vless') links.push(`vless://${uuid}@${svr}:${port}?encryption=none&security=${isTls?'tls':'none'}&type=ws&host=${h}&path=${ep}&sni=${s}#${n}%20[VL]`);
                if (configType === 'mix' || configType === 'shadowsocks') links.push(`ss://${btoa(`none:${uuid}`)}@${svr}:${port}?encryption=none&type=ws&host=${h}&path=${ep}&security=${isTls?'tls':'none'}&sni=${s}#${n}%20[SS]`);
            });
        });
        output = links.join('\n');
    }

    setResult(output);
    setLoading(false);
    setShowResult(true);
  };

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-grow lg:overflow-y-auto custom-scroll">
        <div className="max-w-4xl mx-auto p-4 lg:p-8">
          <div className="gento-card rounded-3xl p-1 w-full min-h-[500px]">
            <div className="bg-slate-900/50 rounded-[1.4rem] p-5 md:p-8 flex flex-col h-full">
              <div className="mb-6 text-center flex-shrink-0">
                <div className="w-12 h-12 mx-auto bg-purple-600/20 rounded-xl flex items-center justify-center mb-4 shadow-lg shadow-purple-500/20">
                     <i className="fas fa-layer-group text-purple-400 text-xl"></i>
                </div>
                <h2 className="font-display text-2xl font-bold text-white">Bulk Config Generator</h2>
                <p className="text-xs text-slate-400 mt-1">Generate multiple V2Ray/Clash/Nekobox configs at once.</p>
              </div>

              <form onSubmit={handleGenerate} className="space-y-6 flex-grow flex flex-col">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div className="space-y-1">
                         <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">Type</label>
                         <select value={configType} onChange={e => setConfigType(e.target.value)} className="gento-input w-full rounded-xl px-4 py-3.5 text-xs cursor-pointer">
                             <option value="vless">VLESS</option>
                             <option value="trojan">Trojan</option>
                             <option value="shadowsocks">Shadowsocks</option>
                             <option value="mix">Mix (All)</option>
                         </select>
                     </div>
                     <div className="space-y-1">
                         <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">Output Format</label>
                         <select value={formatType} onChange={e => setFormatType(e.target.value)} className="gento-input w-full rounded-xl px-4 py-3.5 text-xs cursor-pointer">
                             <option value="v2ray">V2Ray Links</option>
                             <option value="clash">Clash YAML</option>
                             <option value="nekobox">Nekobox JSON</option>
                         </select>
                     </div>
                 </div>

                 <div className="space-y-1">
                     <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">UUID / Password</label>
                     <div className="flex gap-2">
                         <input type="text" value={uuid} onChange={e => setUuid(e.target.value)} className="gento-input w-full rounded-xl px-4 py-3.5 text-xs font-mono text-purple-300" required />
                         <button type="button" onClick={() => setUuid(generateUUID())} className="w-12 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"><i className="fas fa-sync-alt"></i></button>
                     </div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                     <div className="space-y-1">
                         <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">Bug Type</label>
                         <select value={bugType} onChange={e => setBugType(e.target.value)} className="gento-input w-full rounded-xl px-4 py-3.5 text-xs">
                             <option value="default">Default (SNI)</option>
                             <option value="non-wildcard">Custom (Normal)</option>
                             <option value="wildcard">Custom (Wildcard)</option>
                         </select>
                     </div>
                     <div className="md:col-span-2 space-y-1">
                         <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">Main Domain</label>
                         <select value={mainDomain} onChange={e => setMainDomain(e.target.value)} className="gento-input w-full rounded-xl px-4 py-3.5 text-xs">
                             {MAIN_DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
                         </select>
                     </div>
                 </div>

                 {(bugType !== 'default') && (
                     <div className="space-y-1 animate-fade-in">
                         <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">Custom Bug (Comma Separated)</label>
                         <input type="text" value={customBug} onChange={e => setCustomBug(e.target.value)} className="gento-input w-full rounded-xl px-4 py-3.5 text-xs" placeholder="bug1.com, bug2.com" />
                     </div>
                 )}

                 <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                     <div className="space-y-1">
                         <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">TLS</label>
                         <select value={tls} onChange={e => setTls(e.target.value)} className="gento-input w-full rounded-xl px-3 py-3 text-xs">
                             <option value="true">TLS (443)</option>
                             <option value="false">None (80)</option>
                         </select>
                     </div>
                     <div className="space-y-1">
                         <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">Country</label>
                         <select value={country} onChange={e => setCountry(e.target.value)} className="gento-input w-full rounded-xl px-3 py-3 text-xs">
                             <option value="">All</option>
                             {countries.map(c => <option key={c} value={c}>{c}</option>)}
                         </select>
                     </div>
                     <div className="space-y-1">
                         <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">Limit</label>
                         <input type="number" value={limit} onChange={e => setLimit(parseInt(e.target.value))} min={1} max={50} className="gento-input w-full rounded-xl px-3 py-3 text-xs" />
                     </div>
                     <div className="flex items-end pb-3">
                         <label className="flex items-center gap-2 cursor-pointer bg-white/5 px-3 py-2 rounded-lg border border-white/5 w-full justify-center hover:bg-white/10 transition">
                             <input type="checkbox" checked={validateProxies} onChange={e => setValidateProxies(e.target.checked)} className="w-4 h-4 rounded bg-black/50 border-white/20 text-purple-600 focus:ring-0" />
                             <span className="text-xs text-slate-300 font-bold">Validate</span>
                         </label>
                     </div>
                 </div>

                 <button type="submit" className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-purple-600/20 transition-all transform active:scale-[0.98] hover:scale-[1.01]">
                    GENERATE CONFIGURATION
                 </button>
              </form>

              <div className="mt-6 space-y-4">
                  {loading && (
                      <div className="flex flex-col items-center justify-center p-6 bg-white/5 rounded-xl border border-white/5">
                          <i className="fas fa-circle-notch fa-spin text-xl text-purple-400 mb-2"></i>
                          <span className="text-xs text-slate-500">Processing...</span>
                      </div>
                  )}

                  {errorMessage && (
                      <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-xs flex items-center gap-3 animate-fade-in shadow-lg shadow-rose-900/20">
                          <i className="fas fa-exclamation-circle text-lg"></i>
                          <p className="font-bold">{errorMessage}</p>
                      </div>
                  )}

                  {validationStatus.show && (
                      <div className="bg-slate-800/80 p-5 rounded-xl border border-white/10 animate-fade-in">
                          <div className="flex justify-between text-xs text-slate-300 mb-2 font-bold"><span>Checking Proxies...</span><span>{validationStatus.current}/{validationStatus.total}</span></div>
                          <div className="h-2 bg-slate-700/50 rounded-full overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300 shadow-[0_0_10px_rgba(168,85,247,0.5)]" style={{ width: `${(validationStatus.current / validationStatus.total) * 100}%` }}></div>
                          </div>
                          <div className="flex gap-6 mt-3 text-[11px] font-mono font-bold justify-center"><span className="text-emerald-400"><i className="fas fa-check mr-1"></i> Active: {validationStatus.valid}</span><span className="text-rose-400"><i className="fas fa-times mr-1"></i> Dead: {validationStatus.invalid}</span></div>
                      </div>
                  )}

                  {showResult && (
                      <div className="animate-fade-in bg-black/20 p-1 rounded-2xl border border-white/5">
                          <div className="gento-input rounded-xl p-1 mb-2">
                              <textarea value={result} readOnly className="w-full h-80 bg-transparent p-4 text-[11px] font-mono text-teal-300 outline-none resize-none custom-scroll leading-relaxed"></textarea>
                          </div>
                          <button onClick={() => { copyToClipboard(result); showToast("Copied!"); }} className="w-full bg-teal-600/20 hover:bg-teal-600/30 text-teal-400 font-bold py-3.5 rounded-xl text-sm border border-teal-500/20 transition-all active:scale-[0.98]">
                              <i className="far fa-copy mr-2"></i> COPY TO CLIPBOARD
                          </button>
                      </div>
                  )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Subscription;
