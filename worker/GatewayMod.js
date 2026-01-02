import { connect } from "cloudflare:sockets";

// Variables
let serviceName = "";
let APP_DOMAIN = "";

let prxIP = "";
let cachedPrxList = [];

// Constant
const horse = "dHJvamFu";
const flash = "dm1lc3M=";
const v2 = "djJyYXk=";
const neko = "Y2xhc2g=";

const PORTS = [443, 80];
const PROTOCOLS = [atob(horse), atob(flash), "ss"];
const KV_PRX_URL = "https://raw.githubusercontent.com/backup-heavenly-demons/gateway/refs/heads/main/kvProxyList.json";
const DNS_SERVER_ADDRESS = "8.8.8.8";
const DNS_SERVER_PORT = 53;
const RELAY_SERVER_UDP = {
  host: "udp-relay.hobihaus.space", // Kontribusi atau cek relay publik disini: https://hub.docker.com/r/kelvinzer0/udp-relay
  port: 7300,
};
const WS_READY_STATE_OPEN = 1;
const WS_READY_STATE_CLOSING = 2;
const CORS_HEADER_OPTIONS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
  "Access-Control-Max-Age": "86400",
};

// Region Mapping
const REGION_MAP = {
  ASIA: ["ID", "SG", "MY", "PH", "TH", "VN", "JP", "KR", "CN", "HK", "TW"],
  SOUTHASIA: ["IN", "BD", "PK", "LK", "NP", "AF", "BT", "MV"],
  CENTRALASIA: ["KZ", "UZ", "TM", "KG", "TJ"],
  NORTHASIA: ["RU"],
  MIDDLEEAST: ["AE", "SA", "IR", "IQ", "JO", "IL", "YE", "SY", "OM", "KW", "QA", "BH", "LB"],
  CIS: ["RU", "UA", "BY", "KZ", "UZ", "AM", "GE", "MD", "TJ", "KG", "TM", "AZ"],
  WESTEUROPE: ["FR", "DE", "NL", "BE", "AT", "CH", "IE", "LU", "MC"],
  EASTEUROPE: ["PL", "CZ", "SK", "HU", "RO", "BG", "MD", "UA", "BY"],
  NORTHEUROPE: ["SE", "FI", "NO", "DK", "EE", "LV", "LT", "IS"],
  SOUTHEUROPE: ["IT", "ES", "PT", "GR", "HR", "SI", "MT", "AL", "BA", "RS", "ME", "MK"],
  EUROPE: ["FR", "DE", "NL", "BE", "AT", "CH", "IE", "LU", "MC", "PL", "CZ", "SK", "HU", "RO", "BG", "MD", "UA", "BY", "SE", "FI", "NO", "DK", "EE", "LV", "LT", "IS", "IT", "ES", "PT", "GR", "HR", "SI", "MT", "AL", "BA", "RS", "ME", "MK"],
  AFRICA: ["ZA", "NG", "EG", "MA", "KE", "DZ", "TN", "GH", "CI", "SN", "ET"],
  NORTHAMERICA: ["US", "CA", "MX"],
  SOUTHAMERICA: ["BR", "AR", "CL", "CO", "PE", "VE", "EC", "UY", "PY", "BO"],
  LATAM: ["MX", "BR", "AR", "CL", "CO", "PE", "VE", "EC", "UY", "PY", "BO", "CR", "GT", "PA", "DO", "HN", "NI", "SV"],
  AMERICA: ["US", "CA", "MX", "BR", "AR", "CL", "CO", "PE", "VE", "EC"],
  OCEANIA: ["AU", "NZ", "PG", "FJ"],
  GLOBAL: []
};

async function getKVPrxList(kvPrxUrl = KV_PRX_URL) {
  if (!kvPrxUrl) {
    throw new Error("No URL Provided!");
  }

  const kvPrx = await fetch(kvPrxUrl);
  if (kvPrx.status == 200) {
    return await kvPrx.json();
  } else {
    return {};
  }
}

async function getPrxList(prxBankUrl) {
  if (!prxBankUrl) {
    return [];
  }

  try {
    const response = await fetch(prxBankUrl);
    if (response.status === 200) {
      const data = await response.json();
      
      // Normalisasi struktur data proxy
      return data.map(proxy => {
        const ip = proxy.prxIP || proxy.ip || proxy.server;
        const port = proxy.prxPort || proxy.port;
        const country = proxy.country || proxy.cc || 'XX';
        
        if (!ip || !port) {
          console.warn('Invalid proxy format:', proxy);
          return null;
        }
        
        return {
          prxIP: ip,
          prxPort: port,
          country: country.toUpperCase()
        };
      }).filter(Boolean);
    } else {
      console.error(`Failed to fetch proxy list: ${response.status}`);
      return [];
    }
  } catch (error) {
    console.error('Error fetching proxy list:', error);
    return [];
  }
}

async function reverseWeb(request, target, targetPath) {
  const targetUrl = new URL(request.url);
  const targetChunk = target.split(":");

  targetUrl.hostname = targetChunk[0];
  targetUrl.port = targetChunk[1]?.toString() || "443";
  targetUrl.pathname = targetPath || targetUrl.pathname;

  const modifiedRequest = new Request(targetUrl, request);

  modifiedRequest.headers.set("X-Forwarded-Host", request.headers.get("Host"));

  const response = await fetch(modifiedRequest);

  const newResponse = new Response(response.body, response);
  for (const [key, value] of Object.entries(CORS_HEADER_OPTIONS)) {
    newResponse.headers.set(key, value);
  }
  newResponse.headers.set("X-Proxied-By", "Cloudflare Worker");

  return newResponse;
}

function bufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

async function embedAssets(response, originalUrl) {
  const rewriter = new HTMLRewriter();

  const fetchAndEncode = async (assetUrl) => {
    try {
      const absoluteUrl = new URL(assetUrl, originalUrl.href).href;
      const assetResponse = await fetch(absoluteUrl);
      if (!assetResponse.ok) return null;

      const contentType = assetResponse.headers.get('content-type') || 'application/octet-stream';
      const buffer = await assetResponse.arrayBuffer();
      const base64 = bufferToBase64(buffer);
      return `data:${contentType};base64,${base64}`;
    } catch (e) {
      console.error(`Failed to fetch and embed asset: ${assetUrl}`, e);
      return null;
    }
  };

  rewriter.on('link[rel="stylesheet"]', {
    async element(element) {
      const href = element.getAttribute('href');
      if (href) {
        const absoluteUrl = new URL(href, originalUrl.href).href;
        const cssResponse = await fetch(absoluteUrl);
        if (cssResponse.ok) {
            const cssText = await cssResponse.text();
            element.replace(`<style>${cssText}</style>`, { html: true });
        }
      }
    },
  });

  rewriter.on('img', {
    async element(element) {
      const src = element.getAttribute('src');
      if (src && !src.startsWith('data:')) {
        const dataUri = await fetchAndEncode(src);
        if (dataUri) {
          element.setAttribute('src', dataUri);
        }
      }
    },
  });

  rewriter.on('script[src]', {
      async element(element) {
          const src = element.getAttribute('src');
          if (src) {
              const absoluteUrl = new URL(src, originalUrl.href).href;
              const scriptResponse = await fetch(absoluteUrl);
              if (scriptResponse.ok) {
                  const scriptText = await scriptResponse.text();
                  element.removeAttribute('src');
                  element.append(scriptText, { html: false });
              }
          }
      }
  });

  return rewriter.transform(response);
}

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      APP_DOMAIN = url.hostname;
      serviceName = APP_DOMAIN.split(".")[0];

      const upgradeHeader = request.headers.get("Upgrade");

      // Handle prx client
      if (upgradeHeader === "websocket") {
        const path = url.pathname;
        console.log(`WebSocket request path: ${path}`);

        // === Format /PROXYLIST/ID,SG,JP ===
        const proxyListMatch = path.match(/^\/PROXYLIST\/([A-Z]{2}(,[A-Z]{2})*)$/i);
        if (proxyListMatch) {
          const countryCodes = proxyListMatch[1].toUpperCase().split(",");
          const proxies = await getPrxList(env.PRX_BANK_URL);

          if (proxies.length === 0) {
            // Fallback ke KV proxy list
            const kvPrx = await getKVPrxList();
            const availableCountries = countryCodes.filter(code => kvPrx[code] && kvPrx[code].length > 0);
            if (availableCountries.length === 0) {
              return new Response(`No proxies available for countries: ${countryCodes.join(",")}`, { status: 404 });
            }
            const prxKey = availableCountries[Math.floor(Math.random() * availableCountries.length)];
            prxIP = kvPrx[prxKey][Math.floor(Math.random() * kvPrx[prxKey].length)];
          } else {
            const filteredProxies = proxies.filter(proxy => countryCodes.includes(proxy.country));
            if (filteredProxies.length === 0) {
              return new Response(`No proxies available for countries: ${countryCodes.join(",")}`, { status: 404 });
            }
            const randomProxy = filteredProxies[Math.floor(Math.random() * filteredProxies.length)];
            prxIP = `${randomProxy.prxIP}:${randomProxy.prxPort}`;
          }

          console.log(`Selected Proxy (/PROXYLIST/${countryCodes.join(",")}): ${prxIP}`);
          return await websocketHandler(request);
        }

        // === Format /ALL atau /ALLn ===
        const allMatch = path.match(/^\/ALL(\d+)?$/i);
        if (allMatch) {
          const index = allMatch[1] ? parseInt(allMatch[1], 10) - 1 : null;
          const proxies = await getPrxList(env.PRX_BANK_URL);

          if (proxies.length === 0) {
            // Fallback ke KV proxy list
            const kvPrx = await getKVPrxList();
            const allProxies = Object.values(kvPrx).flat();
            if (allProxies.length === 0) {
              return new Response(`No proxies available for /ALL${index !== null ? index + 1 : ""}`, { status: 404 });
            }
            prxIP = allProxies[Math.floor(Math.random() * allProxies.length)];
          } else {
            let selectedProxy;
            
            if (index === null) {
              selectedProxy = proxies[Math.floor(Math.random() * proxies.length)];
            } else {
              const groupedByCountry = proxies.reduce((acc, proxy) => {
                if (!acc[proxy.country]) acc[proxy.country] = [];
                acc[proxy.country].push(proxy);
                return acc;
              }, {});

              const proxiesByIndex = [];
              for (const country in groupedByCountry) {
                const countryProxies = groupedByCountry[country];
                if (index < countryProxies.length) {
                  proxiesByIndex.push(countryProxies[index]);
                }
              }

              if (proxiesByIndex.length === 0) {
                return new Response(`No proxy at index ${index + 1} for any country`, { status: 404 });
              }

              selectedProxy = proxiesByIndex[Math.floor(Math.random() * proxiesByIndex.length)];
            }

            prxIP = `${selectedProxy.prxIP}:${selectedProxy.prxPort}`;
          }

          console.log(`Selected Proxy (/ALL${index !== null ? index + 1 : ""}): ${prxIP}`);
          return await websocketHandler(request);
        }

        // === Format /PUTAR atau /PUTARn ===
        const putarMatch = path.match(/^\/PUTAR(\d+)?$/i);
        if (putarMatch) {
          const countryCount = putarMatch[1] ? parseInt(putarMatch[1], 10) : null;
          const proxies = await getPrxList(env.PRX_BANK_URL);

          if (proxies.length === 0) {
            // Fallback ke KV proxy list
            const kvPrx = await getKVPrxList();
            const countries = Object.keys(kvPrx).filter(code => kvPrx[code] && kvPrx[code].length > 0);
            
            if (countries.length === 0) {
              return new Response(`No proxies available for /PUTAR${countryCount || ""}`, { status: 404 });
            }

            let selectedCountries;
            if (countryCount === null) {
              selectedCountries = countries;
            } else {
              const shuffled = [...countries].sort(() => Math.random() - 0.5);
              selectedCountries = shuffled.slice(0, Math.min(countryCount, countries.length));
            }

            const prxKey = selectedCountries[Math.floor(Math.random() * selectedCountries.length)];
            prxIP = kvPrx[prxKey][Math.floor(Math.random() * kvPrx[prxKey].length)];
          } else {
            const groupedByCountry = proxies.reduce((acc, proxy) => {
              if (!acc[proxy.country]) acc[proxy.country] = [];
              acc[proxy.country].push(proxy);
              return acc;
            }, {});

            const countries = Object.keys(groupedByCountry);
            
            if (countries.length === 0) {
              return new Response(`No proxies available`, { status: 404 });
            }

            let selectedCountries;
            
            if (countryCount === null) {
              selectedCountries = countries;
            } else {
              const shuffled = [...countries].sort(() => Math.random() - 0.5);
              selectedCountries = shuffled.slice(0, Math.min(countryCount, countries.length));
            }

            const selectedProxies = selectedCountries.map(country => {
              const countryProxies = groupedByCountry[country];
              return countryProxies[Math.floor(Math.random() * countryProxies.length)];
            });

            const randomProxy = selectedProxies[Math.floor(Math.random() * selectedProxies.length)];
            prxIP = `${randomProxy.prxIP}:${randomProxy.prxPort}`;
          }

          console.log(`Selected Proxy (/PUTAR${countryCount || ""}): ${prxIP}`);
          return await websocketHandler(request);
        }

        // === Format /REGION atau /REGIONn ===
        const regionMatch = path.match(/^\/([A-Z]+)(\d+)?$/i);
        if (regionMatch) {
          const regionKey = regionMatch[1].toUpperCase();
          const index = regionMatch[2] ? parseInt(regionMatch[2], 10) - 1 : null;
          
          if (REGION_MAP[regionKey] !== undefined) {
            const countries = REGION_MAP[regionKey];
            const proxies = await getPrxList(env.PRX_BANK_URL);

            if (proxies.length === 0) {
              // Fallback ke KV proxy list
              const kvPrx = await getKVPrxList();
              let availableProxies = [];
              
              if (regionKey === "GLOBAL") {
                availableProxies = Object.values(kvPrx).flat();
              } else {
                for (const country of countries) {
                  if (kvPrx[country] && kvPrx[country].length > 0) {
                    availableProxies.push(...kvPrx[country]);
                  }
                }
              }

              if (availableProxies.length === 0) {
                return new Response(`No proxies available for region: ${regionKey}`, { status: 404 });
              }

              if (index === null) {
                prxIP = availableProxies[Math.floor(Math.random() * availableProxies.length)];
              } else {
                if (index < 0 || index >= availableProxies.length) {
                  return new Response(`Index ${index + 1} out of range for region ${regionKey}`, { status: 400 });
                }
                prxIP = availableProxies[index];
              }
            } else {
              const filteredProxies = regionKey === "GLOBAL" 
                ? proxies
                : proxies.filter(p => countries.includes(p.country));

              if (filteredProxies.length === 0) {
                return new Response(`No proxies available for region: ${regionKey}`, { status: 404 });
              }

              let selectedProxy;
              
              if (index === null) {
                selectedProxy = filteredProxies[Math.floor(Math.random() * filteredProxies.length)];
              } else {
                if (index < 0 || index >= filteredProxies.length) {
                  return new Response(`Index ${index + 1} out of range for region ${regionKey}`, { status: 400 });
                }
                selectedProxy = filteredProxies[index];
              }

              prxIP = `${selectedProxy.prxIP}:${selectedProxy.prxPort}`;
            }

            console.log(`Selected Proxy (/${regionKey}${index !== null ? index + 1 : ""}): ${prxIP}`);
            return await websocketHandler(request);
          }
        }

        // === Format /CC atau /CCn (Country Code) ===
        const countryMatch = path.match(/^\/([A-Z]{2})(\d+)?$/);
        if (countryMatch) {
          const countryCode = countryMatch[1].toUpperCase();
          const index = countryMatch[2] ? parseInt(countryMatch[2], 10) - 1 : null;
          const proxies = await getPrxList(env.PRX_BANK_URL);
          
          if (proxies.length === 0) {
            // Fallback ke KV proxy list
            const kvPrx = await getKVPrxList();
            if (!kvPrx[countryCode] || kvPrx[countryCode].length === 0) {
              return new Response(`No proxies available for country: ${countryCode}`, { status: 404 });
            }

            if (index === null) {
              prxIP = kvPrx[countryCode][Math.floor(Math.random() * kvPrx[countryCode].length)];
            } else {
              if (index < 0 || index >= kvPrx[countryCode].length) {
                return new Response(`Index ${index + 1} out of range for country ${countryCode}`, { status: 400 });
              }
              prxIP = kvPrx[countryCode][index];
            }
          } else {
            const filteredProxies = proxies.filter(proxy => proxy.country === countryCode);

            if (filteredProxies.length === 0) {
              return new Response(`No proxies available for country: ${countryCode}`, { status: 404 });
            }

            let selectedProxy;
            
            if (index === null) {
              selectedProxy = filteredProxies[Math.floor(Math.random() * filteredProxies.length)];
            } else {
              if (index < 0 || index >= filteredProxies.length) {
                return new Response(`Index ${index + 1} out of range for country ${countryCode}`, { status: 400 });
              }
              selectedProxy = filteredProxies[index];
            }

            prxIP = `${selectedProxy.prxIP}:${selectedProxy.prxPort}`;
          }

          console.log(`Selected Proxy (/${countryCode}${index !== null ? index + 1 : ""}): ${prxIP}`);
          return await websocketHandler(request);
        }

        // === Format /ip:port atau /ip=port atau /ip-port ===
        const ipPortMatch = path.match(/^\/(.+[:=-]\d+)$/);
        if (ipPortMatch) {
          prxIP = ipPortMatch[1].replace(/[=:-]/, ":");
          console.log(`Direct Proxy IP: ${prxIP}`);
          return await websocketHandler(request);
        }

        // === Format lama untuk kompatibilitas ===
        if (url.pathname.length === 3 || url.pathname.includes(',')) {
          const prxKeys = url.pathname.replace("/", "").toUpperCase().split(",");
          const prxKey = prxKeys[Math.floor(Math.random() * prxKeys.length)];
          const kvPrx = await getKVPrxList();

          if (kvPrx[prxKey] && kvPrx[prxKey].length > 0) {
            prxIP = kvPrx[prxKey][Math.floor(Math.random() * kvPrx[prxKey].length)];
            console.log(`Legacy Proxy (/${prxKeys.join(",")}): ${prxIP}`);
            return await websocketHandler(request);
          } else {
            return new Response(`No proxies available for country: ${prxKey}`, { status: 404 });
          }
        }
      }

      // Handle reverse proxy untuk request non-WebSocket
      const targetReversePrx = env.REVERSE_PRX_TARGET || "example.com";
      const response = await reverseWeb(request, targetReversePrx);

      const contentType = response.headers.get('content-type') || '';

      if (env.EMBED_ASSETS === 'true' && contentType.includes('text/html')) {
        return embedAssets(response, new URL(request.url));
      }

      return response;
    } catch (err) {
      console.error('Global error:', err);
      return new Response(`An error occurred: ${err.toString()}`, {
        status: 500,
        headers: {
          ...CORS_HEADER_OPTIONS,
        },
      });
    }
  },
};

// ... (fungsi-fungsi websocketHandler, protocolSniffer, handleTCPOutBound, handleUDPOutbound, makeReadableWebSocketStream, readSsHeader, readFlashHeader, readHorseHeader, remoteSocketToWS, safeCloseWebSocket, base64ToArrayBuffer, arrayBufferToHex TETAP SAMA seperti kode gateway asli)

async function websocketHandler(request) {
  const webSocketPair = new WebSocketPair();
  const [client, webSocket] = Object.values(webSocketPair);

  webSocket.accept();

  let addressLog = "";
  let portLog = "";
  const log = (info, event) => {
    console.log(`[${addressLog}:${portLog}] ${info}`, event || "");
  };
  const earlyDataHeader = request.headers.get("sec-websocket-protocol") || "";

  const readableWebSocketStream = makeReadableWebSocketStream(webSocket, earlyDataHeader, log);

  let remoteSocketWrapper = {
    value: null,
  };
  let isDNS = false;

  readableWebSocketStream
    .pipeTo(
      new WritableStream({
        async write(chunk, controller) {
          if (isDNS) {
            return handleUDPOutbound(
              DNS_SERVER_ADDRESS,
              DNS_SERVER_PORT,
              chunk,
              webSocket,
              null,
              log,
              RELAY_SERVER_UDP
            );
          }
          if (remoteSocketWrapper.value) {
            const writer = remoteSocketWrapper.value.writable.getWriter();
            await writer.write(chunk);
            writer.releaseLock();
            return;
          }

          const protocol = await protocolSniffer(chunk);
          let protocolHeader;

          if (protocol === atob(horse)) {
            protocolHeader = readHorseHeader(chunk);
          } else if (protocol === atob(flash)) {
            protocolHeader = readFlashHeader(chunk);
          } else if (protocol === "ss") {
            protocolHeader = readSsHeader(chunk);
          } else {
            throw new Error("Unknown Protocol!");
          }

          addressLog = protocolHeader.addressRemote;
          portLog = `${protocolHeader.portRemote} -> ${protocolHeader.isUDP ? "UDP" : "TCP"}`;

          if (protocolHeader.hasError) {
            throw new Error(protocolHeader.message);
          }

          if (protocolHeader.isUDP) {
            if (protocolHeader.portRemote === 53) {
              isDNS = true;
              return handleUDPOutbound(
                DNS_SERVER_ADDRESS,
                DNS_SERVER_PORT,
                chunk,
                webSocket,
                protocolHeader.version,
                log,
                RELAY_SERVER_UDP
              );
            }

            return handleUDPOutbound(
              protocolHeader.addressRemote,
              protocolHeader.portRemote,
              chunk,
              webSocket,
              protocolHeader.version,
              log,
              RELAY_SERVER_UDP
            );
          }

          handleTCPOutBound(
            remoteSocketWrapper,
            protocolHeader.addressRemote,
            protocolHeader.portRemote,
            protocolHeader.rawClientData,
            webSocket,
            protocolHeader.version,
            log
          );
        },
        close() {
          log(`readableWebSocketStream is close`);
        },
        abort(reason) {
          log(`readableWebSocketStream is abort`, JSON.stringify(reason));
        },
      })
    )
    .catch((err) => {
      log("readableWebSocketStream pipeTo error", err);
    });

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}

async function protocolSniffer(buffer) {
  if (buffer.byteLength >= 62) {
    const horseDelimiter = new Uint8Array(buffer.slice(56, 60));
    if (horseDelimiter[0] === 0x0d && horseDelimiter[1] === 0x0a) {
      if (horseDelimiter[2] === 0x01 || horseDelimiter[2] === 0x03 || horseDelimiter[2] === 0x7f) {
        if (horseDelimiter[3] === 0x01 || horseDelimiter[3] === 0x03 || horseDelimiter[3] === 0x04) {
          return atob(horse);
        }
      }
    }
  }

  const flashDelimiter = new Uint8Array(buffer.slice(1, 17));
  // Hanya mendukung UUID v4
  if (arrayBufferToHex(flashDelimiter).match(/^[0-9a-f]{8}[0-9a-f]{4}4[0-9a-f]{3}[89ab][0-9a-f]{3}[0-9a-f]{12}$/i)) {
    return atob(flash);
  }

  return "ss"; // default
}

async function handleTCPOutBound(
  remoteSocket,
  addressRemote,
  portRemote,
  rawClientData,
  webSocket,
  responseHeader,
  log
) {
  async function connectAndWrite(address, port) {
    const tcpSocket = connect({
      hostname: address,
      port: port,
    });
    remoteSocket.value = tcpSocket;
    log(`connected to ${address}:${port}`);
    const writer = tcpSocket.writable.getWriter();
    await writer.write(rawClientData);
    writer.releaseLock();

    return tcpSocket;
  }

  async function retry() {
    const tcpSocket = await connectAndWrite(
      prxIP.split(/[:=-]/)[0] || addressRemote,
      prxIP.split(/[:=-]/)[1] || portRemote
    );
    tcpSocket.closed
      .catch((error) => {
        console.log("retry tcpSocket closed error", error);
      })
      .finally(() => {
        safeCloseWebSocket(webSocket);
      });
    remoteSocketToWS(tcpSocket, webSocket, responseHeader, null, log);
  }

  const tcpSocket = await connectAndWrite(addressRemote, portRemote);

  remoteSocketToWS(tcpSocket, webSocket, responseHeader, retry, log);
}

async function handleUDPOutbound(targetAddress, targetPort, dataChunk, webSocket, responseHeader, log, relay) {
  try {
    let protocolHeader = responseHeader;

    const tcpSocket = connect({
      hostname: relay.host,
      port: relay.port,
    });

    const header = `udp:${targetAddress}:${targetPort}`;
    const headerBuffer = new TextEncoder().encode(header);
    const separator = new Uint8Array([0x7c]);
    const relayMessage = new Uint8Array(headerBuffer.length + separator.length + dataChunk.byteLength);
    relayMessage.set(headerBuffer, 0);
    relayMessage.set(separator, headerBuffer.length);
    relayMessage.set(new Uint8Array(dataChunk), headerBuffer.length + separator.length);

    const writer = tcpSocket.writable.getWriter();
    await writer.write(relayMessage);
    writer.releaseLock();

    await tcpSocket.readable.pipeTo(
      new WritableStream({
        async write(chunk) {
          if (webSocket.readyState === WS_READY_STATE_OPEN) {
            if (protocolHeader) {
              webSocket.send(await new Blob([protocolHeader, chunk]).arrayBuffer());
              protocolHeader = null;
            } else {
              webSocket.send(chunk);
            }
          }
        },
        close() {
          log(`UDP connection to ${targetAddress} closed`);
        },
        abort(reason) {
          console.error(`UDP connection aborted due to ${reason}`);
        },
      })
    );
  } catch (e) {
    console.error(`Error while handling UDP outbound: ${e.message}`);
  }
}

function makeReadableWebSocketStream(webSocketServer, earlyDataHeader, log) {
  let readableStreamCancel = false;
  const stream = new ReadableStream({
    start(controller) {
      webSocketServer.addEventListener("message", (event) => {
        if (readableStreamCancel) {
          return;
        }
        const message = event.data;
        controller.enqueue(message);
      });
      webSocketServer.addEventListener("close", () => {
        safeCloseWebSocket(webSocketServer);
        if (readableStreamCancel) {
          return;
        }
        controller.close();
      });
      webSocketServer.addEventListener("error", (err) => {
        log("webSocketServer has error");
        controller.error(err);
      });
      const { earlyData, error } = base64ToArrayBuffer(earlyDataHeader);
      if (error) {
        controller.error(error);
      } else if (earlyData) {
        controller.enqueue(earlyData);
      }
    },

    pull(controller) {},
    cancel(reason) {
      if (readableStreamCancel) {
        return;
      }
      log(`ReadableStream was canceled, due to ${reason}`);
      readableStreamCancel = true;
      safeCloseWebSocket(webSocketServer);
    },
  });

  return stream;
}

function readSsHeader(ssBuffer) {
  const view = new DataView(ssBuffer);

  const addressType = view.getUint8(0);
  let addressLength = 0;
  let addressValueIndex = 1;
  let addressValue = "";

  switch (addressType) {
    case 1:
      addressLength = 4;
      addressValue = new Uint8Array(ssBuffer.slice(addressValueIndex, addressValueIndex + addressLength)).join(".");
      break;
    case 3:
      addressLength = new Uint8Array(ssBuffer.slice(addressValueIndex, addressValueIndex + 1))[0];
      addressValueIndex += 1;
      addressValue = new TextDecoder().decode(ssBuffer.slice(addressValueIndex, addressValueIndex + addressLength));
      break;
    case 4:
      addressLength = 16;
      const dataView = new DataView(ssBuffer.slice(addressValueIndex, addressValueIndex + addressLength));
      const ipv6 = [];
      for (let i = 0; i < 8; i++) {
        ipv6.push(dataView.getUint16(i * 2).toString(16));
      }
      addressValue = ipv6.join(":");
      break;
    default:
      return {
        hasError: true,
        message: `Invalid addressType for SS: ${addressType}`,
      };
  }

  if (!addressValue) {
    return {
      hasError: true,
      message: `Destination address empty, address type is: ${addressType}`,
    };
  }

  const portIndex = addressValueIndex + addressLength;
  const portBuffer = ssBuffer.slice(portIndex, portIndex + 2);
  const portRemote = new DataView(portBuffer).getUint16(0);
  return {
    hasError: false,
    addressRemote: addressValue,
    addressType: addressType,
    portRemote: portRemote,
    rawDataIndex: portIndex + 2,
    rawClientData: ssBuffer.slice(portIndex + 2),
    version: null,
    isUDP: portRemote == 53,
  };
}

function readFlashHeader(buffer) {
  const version = new Uint8Array(buffer.slice(0, 1));
  let isUDP = false;

  const optLength = new Uint8Array(buffer.slice(17, 18))[0];

  const cmd = new Uint8Array(buffer.slice(18 + optLength, 18 + optLength + 1))[0];
  if (cmd === 1) {
  } else if (cmd === 2) {
    isUDP = true;
  } else {
    return {
      hasError: true,
      message: `command ${cmd} is not supported`,
    };
  }
  const portIndex = 18 + optLength + 1;
  const portBuffer = buffer.slice(portIndex, portIndex + 2);
  const portRemote = new DataView(portBuffer).getUint16(0);

  let addressIndex = portIndex + 2;
  const addressBuffer = new Uint8Array(buffer.slice(addressIndex, addressIndex + 1));

  const addressType = addressBuffer[0];
  let addressLength = 0;
  let addressValueIndex = addressIndex + 1;
  let addressValue = "";
  switch (addressType) {
    case 1: // For IPv4
      addressLength = 4;
      addressValue = new Uint8Array(buffer.slice(addressValueIndex, addressValueIndex + addressLength)).join(".");
      break;
    case 2: // For Domain
      addressLength = new Uint8Array(buffer.slice(addressValueIndex, addressValueIndex + 1))[0];
      addressValueIndex += 1;
      addressValue = new TextDecoder().decode(buffer.slice(addressValueIndex, addressValueIndex + addressLength));
      break;
    case 3: // For IPv6
      addressLength = 16;
      const dataView = new DataView(buffer.slice(addressValueIndex, addressValueIndex + addressLength));
      const ipv6 = [];
      for (let i = 0; i < 8; i++) {
        ipv6.push(dataView.getUint16(i * 2).toString(16));
      }
      addressValue = ipv6.join(":");
      break;
    default:
      return {
        hasError: true,
        message: `invild  addressType is ${addressType}`,
      };
  }
  if (!addressValue) {
    return {
      hasError: true,
      message: `addressValue is empty, addressType is ${addressType}`,
    };
  }

  return {
    hasError: false,
    addressRemote: addressValue,
    addressType: addressType,
    portRemote: portRemote,
    rawDataIndex: addressValueIndex + addressLength,
    rawClientData: buffer.slice(addressValueIndex + addressLength),
    version: new Uint8Array([version[0], 0]),
    isUDP: isUDP,
  };
}

function readHorseHeader(buffer) {
  const dataBuffer = buffer.slice(58);
  if (dataBuffer.byteLength < 6) {
    return {
      hasError: true,
      message: "invalid request data",
    };
  }

  let isUDP = false;
  const view = new DataView(dataBuffer);
  const cmd = view.getUint8(0);
  if (cmd == 3) {
    isUDP = true;
  } else if (cmd != 1) {
    throw new Error("Unsupported command type!");
  }

  let addressType = view.getUint8(1);
  let addressLength = 0;
  let addressValueIndex = 2;
  let addressValue = "";
  switch (addressType) {
    case 1: // For IPv4
      addressLength = 4;
      addressValue = new Uint8Array(dataBuffer.slice(addressValueIndex, addressValueIndex + addressLength)).join(".");
      break;
    case 3: // For Domain
      addressLength = new Uint8Array(dataBuffer.slice(addressValueIndex, addressValueIndex + 1))[0];
      addressValueIndex += 1;
      addressValue = new TextDecoder().decode(dataBuffer.slice(addressValueIndex, addressValueIndex + addressLength));
      break;
    case 4: // For IPv6
      addressLength = 16;
      const dataView = new DataView(dataBuffer.slice(addressValueIndex, addressValueIndex + addressLength));
      const ipv6 = [];
      for (let i = 0; i < 8; i++) {
        ipv6.push(dataView.getUint16(i * 2).toString(16));
      }
      addressValue = ipv6.join(":");
      break;
    default:
      return {
        hasError: true,
        message: `invalid addressType is ${addressType}`,
      };
  }

  if (!addressValue) {
    return {
      hasError: true,
      message: `address is empty, addressType is ${addressType}`,
    };
  }

  const portIndex = addressValueIndex + addressLength;
  const portBuffer = dataBuffer.slice(portIndex, portIndex + 2);
  const portRemote = new DataView(portBuffer).getUint16(0);
  return {
    hasError: false,
    addressRemote: addressValue,
    addressType: addressType,
    portRemote: portRemote,
    rawDataIndex: portIndex + 4,
    rawClientData: dataBuffer.slice(portIndex + 4),
    version: null,
    isUDP: isUDP,
  };
}

async function remoteSocketToWS(remoteSocket, webSocket, responseHeader, retry, log) {
  let header = responseHeader;
  let hasIncomingData = false;
  await remoteSocket.readable
    .pipeTo(
      new WritableStream({
        start() {},
        async write(chunk, controller) {
          hasIncomingData = true;
          if (webSocket.readyState !== WS_READY_STATE_OPEN) {
            controller.error("webSocket.readyState is not open, maybe close");
          }
          if (header) {
            webSocket.send(await new Blob([header, chunk]).arrayBuffer());
            header = null;
          } else {
            webSocket.send(chunk);
          }
        },
        close() {
          log(`remoteConnection!.readable is close with hasIncomingData is ${hasIncomingData}`);
        },
        abort(reason) {
          console.error(`remoteConnection!.readable abort`, reason);
        },
      })
    )
    .catch((error) => {
      console.error(`remoteSocketToWS has exception `, error.stack || error);
      safeCloseWebSocket(webSocket);
    });
  if (hasIncomingData === false && retry) {
    log(`retry`);
    retry();
  }
}

function safeCloseWebSocket(socket) {
  try {
    if (socket.readyState === WS_READY_STATE_OPEN || socket.readyState === WS_READY_STATE_CLOSING) {
      socket.close();
    }
  } catch (error) {
    console.error("safeCloseWebSocket error", error);
  }
}

// Helpers
function base64ToArrayBuffer(base64Str) {
  if (!base64Str) {
    return { error: null };
  }
  try {
    base64Str = base64Str.replace(/-/g, "+").replace(/_/g, "/");
    const decode = atob(base64Str);
    const arryBuffer = Uint8Array.from(decode, (c) => c.charCodeAt(0));
    return { earlyData: arryBuffer.buffer, error: null };
  } catch (error) {
    return { error };
  }
}

function arrayBufferToHex(buffer) {
  return [...new Uint8Array(buffer)].map((x) => x.toString(16).padStart(2, "0")).join("");
}