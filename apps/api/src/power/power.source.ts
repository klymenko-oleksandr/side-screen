import { SnapshotSource } from '../snapshot/snapshot';

/**
 * DI token for the Power module's data. Phase 2 replaces the mock with the
 * aggregator over the signal providers (DTEK schedule, DTEK live, charger).
 */
export abstract class PowerSource extends SnapshotSource<'power'> {}
