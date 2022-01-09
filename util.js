/**
 * @param {number} money Amount to format
 * @return {string} formatted amount
 */
export function formatMoney(money) {
	const sign = [
		{ v: 1e3, s: "K" },
		{ v: 1e6, s: "M" },
		{ v: 1e9, s: "B" },
		{ v: 1e12, s: "T" },
		{ v: 1e15, s: "Q" }
	]
	let index;
	for (index = sign.length - 1; index > 0; index--) {
		if (money >= sign[index].v) {
			break;
		}
	}
	return (money / sign[index].v).toFixed(2) + sign[index].s;
}

/**
 * @param {NS} ns
 * @return {string[]} list of all servers up to the given depth starting from Home
 */
export function findAllServers(ns) {
	return doScan(ns, "home", "home", -1);
}

/**
 * @param {NS} ns
 * @param {number} depth
 * @return {string[]} list of all servers up to the given depth starting from Home
 */
export function findServers(ns, depth) {
	return doScan(ns, "home", "home", depth);
}

/**
 * @param {NS} ns
 * @param {string} parentServer - The starting point
 * @param {string} server
 * @param {number} depth - how deep to walk
 * @return {string[]} list of all servers up to the given depth
 */
function doScan(ns, parentServer, server, depth) {
	let neighbors = getNonParentNeighbors(ns, parentServer, server);
	if (neighbors.size == 0) {
		return neighbors;
	}
	if (depth > 1 || depth < 0) {
		let downstream = neighbors.flatMap(neighbor => doScan(ns, server, neighbor, depth - 1));
		downstream.forEach(server => neighbors.push(server));
	}
	return neighbors;
}

/**
 * @param {NS} ns
 * @param {string} parent The parent node
 * @param {string} server The server to scan
 * @return {string[]} - Array of all neighbor nodes
 */
function getNonParentNeighbors(ns, parent, server) {
	return ns.scan(server).filter(result => result !== parent);
}