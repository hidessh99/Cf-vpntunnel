import { V2RayConfig } from '../types';

export function parseVmess(l: string): V2RayConfig {
    const c = JSON.parse(atob(l.replace("vmess://", "")));
    const net = c.net || "tcp";
    const type = c.type || "";
    const path = c.path || "";
    const host = c.host || c.add;
    return {
        type: "vmess",
        name: c.ps || "VMess",
        server: c.add,
        port: parseInt(c.port),
        uuid: c.id,
        alterId: parseInt(c.aid || '0'),
        cipher: c.scy || "auto",
        tls: c.tls === "tls",
        network: net,
        transportType: type,
        serviceName: (net === "grpc" || type === "grpc") ? path : "",
        wsPath: (net === "ws") ? path : "",
        wsHost: (net === "ws") ? host : "",
        sni: c.sni || host,
        skipCertVerify: true
    };
}

export function parseVless(l: string): V2RayConfig {
    const u = new URL(l);
    const p = u.searchParams;
    const net = p.get("type") || "tcp";
    const path = p.get("path") || "";
    const host = p.get("host") || u.hostname;
    return {
        type: "vless",
        name: decodeURIComponent(u.hash.substring(1)),
        server: u.hostname,
        port: parseInt(u.port),
        uuid: u.username,
        tls: p.get("security") === "tls",
        network: net,
        flow: p.get("flow") || "",
        serviceName: net === "grpc" ? (p.get("serviceName") || "") : "",
        wsPath: (net === "ws" || net === "httpupgrade") ? path : "",
        wsHost: (net === "ws" || net === "httpupgrade") ? host : "",
        sni: p.get("sni") || host,
        skipCertVerify: true
    };
}

export function parseTrojan(l: string): V2RayConfig {
    const u = new URL(l);
    const p = u.searchParams;
    const net = p.get("type") || "tcp";
    const path = p.get("path") || "";
    const host = p.get("host") || u.hostname;
    return {
        type: "trojan",
        name: decodeURIComponent(u.hash.substring(1)),
        server: u.hostname,
        port: parseInt(u.port),
        password: u.username,
        tls: true,
        network: net,
        serviceName: net === "grpc" ? (p.get("serviceName") || p.get("alpn") || "") : "",
        wsPath: (net === "ws" || net === "httpupgrade") ? path : "",
        wsHost: (net === "ws" || net === "httpupgrade") ? host : "",
        sni: p.get("sni") || host,
        skipCertVerify: true
    };
}

export function parseSS(l: string): V2RayConfig {
    const c = l.replace("ss://", "");
    let i = "", s = "", n = "", p: any = {};
    
    if (c.includes("@")) {
        const [u, r] = c.split("@");
        if (r.includes("?")) {
            const [sp, tp] = r.split("?");
            s = sp;
            const [ps, en] = tp.split("#");
            n = en ? decodeURIComponent(en) : "SS";
            ps.split("&").forEach(x => {
                const [k, v] = x.split("=");
                p[k] = v ? decodeURIComponent(v) : ""
            })
        } else {
            const [sp, en] = r.split("#");
            s = sp;
            n = en ? decodeURIComponent(en) : "SS"
        }
        try {
            i = atob(u)
        } catch {
            i = decodeURIComponent(u)
        }
    } else {
        const [ed, en] = c.split("#");
        const dd = atob(ed);
        const at = dd.lastIndexOf("@");
        i = dd.substring(0, at);
        s = dd.substring(at + 1);
        n = en ? decodeURIComponent(en) : "SS";
    }
    const [m, pwd] = i.split(":");
    const [sv, pt] = s.split(":");
    const tls = p.security === "tls" || (p.plugin_opts && p.plugin_opts.includes("tls=1"));
    const wsPath = p.path || (p.plugin_opts ? (p.plugin_opts.match(/path=([^;]+)/) || ["", ""])[1] : "");
    const wsHost = p.host || (p.plugin_opts ? (p.plugin_opts.match(/host=([^;]+)/) || ["", ""])[1] : sv);
    
    return {
        type: "ss",
        name: n,
        server: sv,
        port: parseInt(pt),
        cipher: m,
        password: pwd,
        tls: tls,
        network: "ws",
        wsPath: wsPath,
        wsHost: wsHost,
        sni: p.sni || sv,
        skipCertVerify: true
    };
}

export function parseV2rayLink(link: string): V2RayConfig {
    if (link.startsWith("vmess://")) return parseVmess(link);
    if (link.startsWith("vless://")) return parseVless(link);
    if (link.startsWith("trojan://")) return parseTrojan(link);
    if (link.startsWith("ss://")) return parseSS(link);
    throw new Error(`Unknown link type: ${link.substring(0,10)}...`);
}
