let _token = '';
let _brandId: number | null = null;

export const getToken = (): string => _token;

export const setRegisteredToken = (token: string): void => {
  _token = token;
};

// Module-level singleton (like _token above) so the active brand survives
// across the multiple Redux store instances this app can end up with — e.g.
// CrmApp mounts its own store even when embedded inside wynta-web's shell,
// so the `ui.selectedBrand` a given app tracks locally isn't visible to
// shared code like copilotSlice. DjHeaderSlot keeps this in sync with the
// bridge payload and brand-switcher events.
export const getBrandId = (): number | null => _brandId;

export const setBrandId = (brandId: number | null): void => {
  _brandId = brandId;
};
