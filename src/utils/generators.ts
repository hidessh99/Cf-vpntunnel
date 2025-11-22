import { V2RayConfig } from '../types';
import { safeBase64Encode } from './common';

export function generateClashConfig(proxies: V2RayConfig[], full: boolean): string {
  const fake = true;
  const bp = false; 
  const lb = false;
  const fb = false;

  let c = `# Clash Config
# Created: ${new Date().toISOString()}
`;
  if (full) {
      c += `port: 7890
socks-port: 7891
allow-lan: true
mode: rule
log-level: silent
external-controller: 0.0.0.0:9090
dns:
  enable: true
  ipv6: false
  listen: 0.0.0.0:7874
  enhanced-mode: ${fake?'fake-ip':'redir-host'}
  nameserver:
    - 8.8.8.8
    - 1.1.1.1
proxies:
`;
  } else {
      c += `proxies:
`;
  }

  const names: string[] = [];
  proxies.forEach((p, i) => {
      const n = `[${i+1}]-${p.name.replace(/["']/g,"")}`;
      names.push(n);
      let entry = `  - name: "${n}"
    type: ${p.type}
    server: ${p.server}
    port: ${p.port}
    udp: true
    skip-cert-verify: true
`;
      if (p.tls) {
          entry += `    tls: true
    servername: ${p.sni}
`;
      }

      if (p.type === 'vmess') entry += `    uuid: ${p.uuid}
    alterId: ${p.alterId}
    cipher: ${p.cipher}
`;
      else if (p.type === 'vless') entry += `    uuid: ${p.uuid}
`;
      else if (p.type === 'trojan') entry += `    password: ${p.password}
`;
      else if (p.type === 'ss') entry += `    cipher: ${p.cipher}
    password: ${p.password}
    plugin: v2ray-plugin
    plugin-opts:
      mode: websocket
      tls: ${p.tls}
      skip-cert-verify: true
      host: ${p.wsHost}
      path: "${p.wsPath}"
      mux: false
`;

      if (p.type !== 'ss') {
          if (p.network === 'ws') entry += `    network: ws
    ws-opts:
      path: "${p.wsPath}"
      headers:
        Host: ${p.wsHost}
`;
          else if (p.network === 'grpc') entry += `    network: grpc
    grpc-opts:
      grpc-service-name: "${p.serviceName}"
`;
      }
      c += entry;
  });

  if (full) {
      c += `proxy-groups:
  - name: "INCONIGTO-MODE"
    type: select
    proxies:
      - SELECTOR
`;
      c += `      - DIRECT
      - REJECT
`;
      c += `  - name: "SELECTOR"
    type: select
    proxies:
      - DIRECT
      - REJECT
`;
      names.forEach(n => c += `      - "${n}"
`);
      c += `rules:
  - MATCH,INCONIGTO-MODE
`;
  }
  return c;
}

export function generateSingleVlessLink(id: string, svr: string, port: number, sec: string, host: string, path: string, sni: string, name: string): { url: string, clash: string } {
    const u = `vless://${id}@${svr}:${port}?encryption=none&security=${sec}&type=ws&host=${host}&path=${path}&sni=${sni}#${name}`;
    const c = `- name: "${decodeURIComponent(name)}"
  type: vless
  server: ${svr}
  port: ${port}
  uuid: ${id}
  network: ws
  tls: ${sec==='tls'}
  servername: ${sni}
  skip-cert-verify: true
  ws-opts:
    path: "${decodeURIComponent(path)}"
    headers:
      Host: ${host}`;
    return { url: u, clash: c };
}

export function generateSingleTrojanLink(pw: string, svr: string, port: number, sec: string, host: string, path: string, sni: string, name: string): { url: string, clash: string } {
    const u = `trojan://${pw}@${svr}:${port}?security=${sec}&type=ws&host=${host}&path=${path}&sni=${sni}#${name}`;
    const c = `- name: "${decodeURIComponent(name)}"
  type: trojan
  server: ${svr}
  port: ${port}
  password: ${pw}
  network: ws
  sni: ${sni}
  skip-cert-verify: true
  ws-opts:
    path: "${decodeURIComponent(path)}"
    headers:
      Host: ${host}`;
    return { url: u, clash: c };
}

export function generateSingleSSLink(pw: string, svr: string, port: number, sec: string, host: string, path: string, sni: string, name: string): { url: string, clash: string } {
    const usr = safeBase64Encode(`none:${pw}`);
    const u = `ss://${usr}@${svr}:${port}?encryption=none&type=ws&host=${host}&path=${path}&security=${sec}&sni=${sni}#${name}`;
    const c = `- name: "${decodeURIComponent(name)}"
  type: ss
  server: ${svr}
  port: ${port}
  cipher: none
  password: ${pw}
  plugin: v2ray-plugin
  plugin-opts:
    mode: websocket
    tls: ${sec==='tls'}
    skip-cert-verify: true
    host: ${host}
    path: "${decodeURIComponent(path)}"
    mux: false`;
    return { url: u, clash: c };
}
