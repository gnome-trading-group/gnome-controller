import { AccountTreasury, VenueAccount } from '../../types/treasury';

// An account as the registry lists it, with its money when the treasury has it (never for a retired account).
export interface AccountRow {
  account: VenueAccount;
  treasury: AccountTreasury | undefined;
}
