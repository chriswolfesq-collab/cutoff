/**
 * Snapshots the review packet.
 *
 * Two jobs in one. `playbook.md` is the document to put in front of a coach —
 * readable without running anything. And because it is a snapshot, any change
 * to a convention shows up as a diff in plain English rather than as a silent
 * shift in behaviour.
 *
 * Run `npx vitest -u` to accept an intended change.
 */

import { expect, it } from 'vitest';
import { buildPlaybook } from './playbook';

it('playbook matches the snapshot', async () => {
  await expect(buildPlaybook()).toMatchFileSnapshot('../../playbook.md');
});
