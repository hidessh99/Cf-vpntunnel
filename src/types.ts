export interface ProxyItem {
  ip: string;
  port: string;
  country: string;
  provider: string;
  status?: 'active' | 'dead' | 'loading' | 'unknown';
  latency?: number;
}