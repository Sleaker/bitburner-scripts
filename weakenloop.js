/** @param {NS} ns **/
export async function main(ns) {
    let [hostname] = ns.args;
	while(true) {
		await ns.weaken(hostname);
	}
}