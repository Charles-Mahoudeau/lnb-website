import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import GhostForm from '~/components/admin/GhostForm.vue';

import type { AdminGhost } from '#shared/schemas/admin';

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const made: AdminGhost = {
  userId: 'g1',
  name: 'Camille Martin',
  email: 'camille.martin@epitech.eu',
  school: 'Epitech',
};
let sent: unknown;
registerEndpoint('/api/admin/users/ghost', { method: 'POST', handler: () => made });

describe('ghost form', () => {
  it('warns that the email must be the one Microsoft sends', async () => {
    const form = await mountSuspended(GhostForm);
    expect(form.text()).toContain('exactly the email Microsoft sends');
  });

  it('does not send an invalid form', async () => {
    const form = await mountSuspended(GhostForm);
    await form.find('form').trigger('submit');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(form.emitted('created')).toBeUndefined();
    sent = undefined;
  });

  it('emits the account once made', async () => {
    const form = await mountSuspended(GhostForm);
    const inputs = form.findAll('input');
    await inputs[0]!.setValue('Camille Martin');
    await inputs[1]!.setValue('camille.martin@epitech.eu');
    (
      form.vm as unknown as { $: { setupState: { state: { tenantId: string } } } }
    ).$.setupState.state.tenantId = EPITECH;
    await form.find('form').trigger('submit');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(form.emitted('created')?.[0]).toEqual([made]);
    expect(sent).toBeUndefined();
  });
});
