import { safeBase64Encode } from './common';

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
    path: ${decodeURIComponent(path)}
    headers:
      Host: ${host}`;
    return { url: u, clash: c };
}

export function generateSingleTrojanLink(pw: string, svr: string, port: number, sec: string, host: string, path: string, sni: string, name: string): { url: string, clash: string } {
    const u = `trojan://${pw}@${svr}:${port}?security=${sec}&type=ws&host=${host}&path=${path}&sni=${sni}#${name}`;
    let c = '';
    if (sec === 'tls') {
        c = `- name: "${decodeURIComponent(name)}"
  type: trojan
  server: ${svr}
  port: ${port}
  password: ${pw}
  network: ws
  sni: ${sni}
  skip-cert-verify: true
  ws-opts:
    path: ${decodeURIComponent(path)}
    headers:
      Host: ${host}`;
    }
    return { url: u, clash: c };
}

export function generateSingleSSLink(pw: string, svr: string, port: number, sec: string, host: string, path: string, sni: string, name: string): { url: string, clash: string } {
    const usr = safeBase64Encode(`none:${pw}`);
    const u = `ss://${usr}@${svr}:${port}?encryption=none&type=ws&host=${host}&path=${path}&security=${sec}&sni=${sni}#${name}`;
    return { url: u, clash: '' };
}
