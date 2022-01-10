/** @param {import('./types/NetscriptDefinitions').NS} ns **/
export async function main(ns) {
	const [target] = ns.args;
	if (!target) {
		exit;
	}
	await ns.weaken(target);
}