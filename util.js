"use strict";
import { Zombie } from './zombie.js';
/**
 * @typedef {import('./types/NetscriptDefinitions').NS} NS
 */

/**
 * Performs a BFS from "home" server walking the tree up to the given depth, or all servers
 * if no depth is given
 * 
 * @param {NS} ns
 * @param {string} parentServer - The starting point
 * @param {string} server
 * @param {number} depth - how deep to walk
 * @return {Zombie[]} list of all servers up to the given depth
 */
export function findServers(ns, depth) {
	let q = [ new Zombie(ns.getServer("home"), ns) ];
	let found = [];
	while(q.length > 0) {
		const nextItem = q.shift();
		if (nextItem.depth > depth && depth > 0) {
			break;
		}
		
		let children = getNonParentNeighbors(ns, nextItem.parent, nextItem.hostname, nextItem.depth + 1);
		for (const child of children) {
			if (found.indexOf(child.hostname) === -1) {
				q.push(child);
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