import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';

export interface AxiosProxyAgents {
    httpAgent?: HttpProxyAgent<string>;
    httpsAgent?: HttpsProxyAgent<string>;
}

export function createAxiosProxyAgentOptions(proxyUrl?: string): AxiosProxyAgents {
    if (!proxyUrl) return {};
    return {
        httpAgent: new HttpProxyAgent(proxyUrl),
        httpsAgent: new HttpsProxyAgent(proxyUrl),
    };
}
