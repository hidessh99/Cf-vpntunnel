export interface ProxyItem {
  ip: string;
  port: string;
  country: string;
  provider: string;
  status?: 'active' | 'dead' | 'loading' | 'unknown';
  latency?: number;
}

export interface V2RayConfig {
  type: 'vmess' | 'vless' | 'trojan' | 'ss';
  name: string;
  server: string;
  port: number;
  uuid?: string;
  password?: string;
  alterId?: number;
  cipher?: string;
  tls?: boolean;
  network?: string;
  transportType?: string;
  serviceName?: string;
  wsPath?: string;
  wsHost?: string;
  sni?: string;
  flow?: string;
  skipCertVerify?: boolean;
}