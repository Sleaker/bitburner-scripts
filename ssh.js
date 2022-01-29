/**
 * @typedef {import('./types/NetscriptDefinitions').NS} NS
 */
import { getConnectionChain } from './util';
import { Logger } from './log';

/**
 * @param {NS} ns 
 * @param {string} hostname 
 */
 export async function main(ns) {
    let log = new Logger(ns, false);
    const file = ns.getOwnedSourceFiles()
        .find(file => file.n === 4);
    
    let [hostname] = ns.args;
    if (!hostname) {
        log.error("hostname must be defined");
        ns.exit();
    }
    const connectChain = getConnectionChain(ns, hostname);
    if (!connectChain || connectChain.length === 0) {
        log.error("%s not found, unable to connect", hostname);
        ns.exit();
    }

    if (!file || file.lvl < 1) {
        log.info("Server-tree: %j", connectChain);
        log.warn("Need access to Source File 4 to auto-connect with this script.");
        ns.exit();
    }
    for (const connector of connectChain) {
        if (!ns.connect(connector)) {
            ns.connect("home");
            log.error("Failed to connect to %s during connection chaining", connector);
            ns.exit();
        }
    }
}

export function autocomplete(data, args) {
    return [...data.servers];
}