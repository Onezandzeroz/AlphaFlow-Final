/**
 * Edge-runtime stub — tom modul-mapning.
 *
 * Bruges KUN af next.config.ts webpack-hook (nextRuntime === 'edge') til at
 * erstatte Node-only moduler i Edge-compilen af src/instrumentation.ts.
 * register() vender tilbage tidligt i Edge (NEXT_RUNTIME-guard), så indholdet
 * her er vilkårligt — modulet må aldrig kaldes. Eksporter explicit tom
 * navngiven funktionssamling, så destructuring ikke crasher ved import-tid.
 */
export const startBackupScheduler = () => {};
export const stopBackupScheduler = () => {};
export const startRecurringScheduler = () => {};
export const stopRecurringScheduler = () => {};
export const startBillingScheduler = () => {};
export const stopBillingScheduler = () => {};
export const startLogMonitorScheduler = () => {};
export const stopLogMonitorScheduler = () => {};
export const startSproomInboxScheduler = () => {};
export const stopSproomInboxScheduler = () => {};
export const startSproomOutboxScheduler = () => {};
export const stopSproomOutboxScheduler = () => {};
export const ensureInitialBackup = async () => {};
export const runAutomaticBackup = async () => {};
export const cleanupExpiredBackups = async () => {};
export const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
export default {};
