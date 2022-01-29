/** @param {import('./types/NetscriptDefinitions').NS} ns **/
export async function main(ns) {
	const [target] = ns.args;
	if (!target) {
		exit;
	}
	await ns.hack(target);
	for (const log of ns.getScriptLogs()) {
		await ns.writePort(9, log.substring(log.indexOf(" ") + 1));
	}
}