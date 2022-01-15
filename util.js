"use strict";
import { exploits, isExploitAvailable, runExploit } from './exploits.js';

/**
 * @typedef {import('./types/NetscriptDefinitions').NS} NS
 */

/**
 * Performs a search from "home" server walking the tree up to the given depth, or all servers
 * if no depth is given
 * @param {{ns: NS, 
 * depth: number, 
 * type: string, 
 * host: string
 * }} options
 * @return {{depth: number, server: Server, parent: string}[]} list of all servers up to the given depth
 */
export function findServers(options) {

	let q = [ { server: options.ns.getServer("home"), depth: 0 }];
	let found = [];
	while(q.length > 0) {
		const nextItem = q.shift();
		if (nextItem.depth >= options.depth && options.depth > 0) {
			continue;
		}
		
		let children = getNonParentNeighbors(options.ns, nextItem.parent, nextItem.server.hostname, nextItem.depth + 1);
		for (const child of children) {
			if (found.indexOf(child.server.hostname) === -1) {
				if (options.type === "bfs") {
					q.push(child);
				} else {
					q.unshift(child);
				}
				found.push(child);
				// If we've specified to find a specific server exit when we've found it 
				if (options.host === child.server.hostname) {
					break;
				}
			}
		}
	}
	return found;
}

/**
 * @param {NS} ns
 * @param {string} parent The parent node
 * @param {string} server The server to scan
 * @param {number} depth How deep in the tree the server is
 * @return {{depth: number, server: Server, parent: string}[]} - Array of all non-parent neighbor nodes
 */
 function getNonParentNeighbors(ns, parent, server, depth) {
	return ns.scan(server)
		.filter(child => child !== parent)
		.map(child => {return { server: ns.getServer(child), parent: server, depth: depth}});
}

/**
 * Note: requires access to Singularity (Source File 4 - level 1)
 * @param {string} server 
 */
export async function installBackdoor(ns, server) {
	let files = ns.getOwnedSourceFiles().filter(file => file.n === 4);
	if (!files || files[0].lvl < 1) {
		return Promise.resolve(false);
	}
	// if the server can't be rooted don't do anything
	if (!server.root) {
		return Promise.resolve(false);
	}
	let chain = getConnectionChain(server);
	// If a connection can't be established don't try anything
	if (!chain) return false;

	for (hostname of chain) {
		if (!ns.connect(hostname)) {
			return Promise.resolve(false);
		}
	}
	await ns.installBackdoor();
	ns.connect("home");
}

/**
 * @param {NS} ns
 * @param {string} server 
 * @return {string[]} array of server hostnames
 */
export function getConnectionChain(ns, server) {
	let allServers = {};
	findServers({ns: ns, depth: -1, host: server, type: "dfs"})
		.forEach(obj => allServers[obj.server.hostname] = obj);
	
	// ns.tprintf("%j", allServers);
	// .reduce((obj, cur) => Object.defineProperty(obj, cur.server.hostname, { value: cur, writeable: true, enumerable: true } ), {});

	// if the key doesn't exist the hostname isn't valid so we can't walk the connection chain backwards
	if (!allServers[server]) return;

	let chain = [ allServers[server] ];
	let found = false;
	while (!found) {
		const next = allServers[chain[0].parent];
		if (typeof(next) === 'undefined') {
			break;
		}
		if (next.parent === "home") {
			found = true;
			break;
		}
		chain.unshift(next);
	}
	return found ? chain.map(current => current.server.hostname) : [];
}

