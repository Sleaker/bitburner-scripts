"use strict";
import { Zombie } from './zombie.js';
import * as log from './log.js';
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
 * }} options
 * @return {Zombie[]} list of all servers up to the given depth
 */
export function findServers(options) {

	let q = [ new Zombie(options.ns.getServer("home"), options.ns) ];
	let found = [];
	while(q.length > 0) {
		const nextItem = q.shift();
		if (nextItem.depth > options.depth && options.depth > 0) {
			continue;
		}
		
		let children = getNonParentNeighbors(options.ns, nextItem.parent, nextItem.hostname, nextItem.depth + 1);
		for (const child of children) {
			if (found.indexOf(child.hostname) === -1) {
				if (options.type === "bfs") {
					q.push(child);
				} else {
					q.unshift(child);
				}
				found.push(child);
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
 * @return {Zombie[]} - Array of all non-parent neighbor nodes
 */
function getNonParentNeighbors(ns, parent, server, depth) {
	return ns.scan(server)
		.filter(child => child !== parent)
		.map(child => new Zombie(ns.getServer(child), ns, server, depth));
}


/**
 * @param {Zombie} zombie 
 */
export function getRootForServer(zombie) {
	exploits.filter(exploit => isExploitAvailable(zombie.ns, exploit))
		.map(exploit => exploit.substring(0, exploit.indexOf(".")))
		.forEach(exploit => runExploit(zombie.ns, exploit, zombie.hostname));
	zombie.ns.nuke(zombie.hostname);
	zombie.updateStats();
	log.success("Rooted server: %s", zombie.hostname);
	zombie.ns.print("Rooted server: " + zombie.hostname);
}

