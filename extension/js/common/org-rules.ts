/* ©️ 2016 - present FlowCrypt a.s. Limitations apply. Contact human@flowcrypt.com */

'use strict';

import { Str } from './core/common.js';
import { AcctStore } from './platform/store/acct-store.js';
import { KeyAlgo } from './core/crypto/key.js';

type DomainRules$flag = 'NO_PRV_CREATE' | 'NO_PRV_BACKUP' | 'PRV_AUTOIMPORT_OR_AUTOGEN' | 'PASS_PHRASE_QUIET_AUTOGEN' |
  'ENFORCE_ATTESTER_SUBMIT' | 'NO_ATTESTER_SUBMIT' | 'NO_KEY_MANAGER_PUB_LOOKUP' | 'USE_LEGACY_ATTESTER_SUBMIT' |
  'DEFAULT_REMEMBER_PASS_PHRASE';

export type DomainRulesJson = {
  flags?: DomainRules$flag[],
  custom_keyserver_url?: string,
  key_manager_url?: string,
  disallow_attester_search_for_domains?: string[],
  enforce_keygen_algo?: string,
  enforce_keygen_expire_months?: number,
};

/**
 * Organisational rules, set domain-wide, and delivered from FlowCrypt Backend
 * These either enforce, alter or forbid various behavior to fit customer needs
 */
export class OrgRules {

  private static readonly default = { flags: [] };

  public static newInstance = async (acctEmail: string): Promise<OrgRules> => {
    const email = Str.parseEmail(acctEmail).email;
    if (!email) {
      throw new Error(`Not a valid email`);
    }
    const storage = await AcctStore.get(email, ['rules']);
    return new OrgRules(storage.rules || OrgRules.default, acctEmail.split('@')[1]);
  }

  public static isPublicEmailProviderDomain = (emailAddrOrDomain: string) => {
    if (emailAddrOrDomain.endsWith('.flowcrypt.com')) {
      // this is here for easier testing. helps our mock tests which run on flowcrypt.com subdomains
      // marking it this way prevents calling FES which is not there, on enterprise builds where FES is required
      return true;
    }
    return ['gmail.com', 'yahoo.com', 'outlook.com', 'live.com'].includes(emailAddrOrDomain.split('@').pop() || 'NONE');
  }

  protected constructor(
    private domainRules: DomainRulesJson,
    public domainName: string
  ) { }

  // optional urls

  /**
   * Internal company SKS-like public key server to trust above Attester
   */
  public getCustomSksPubkeyServer = (): string | undefined => {
    return this.domainRules.custom_keyserver_url;
  }

  /**
   * an internal org FlowCrypt Email Key Manager instance, can manage both public and private keys
   * use this method when using for PRV sync
   */
  public getKeyManagerUrlForPrivateKeys = (): string | undefined => {
    return this.domainRules.key_manager_url;
  }

  /**
   * an internal org FlowCrypt Email Key Manager instance, can manage both public and private keys
   * use this method when using for PUB sync
   */
  public getKeyManagerUrlForPublicKeys = (): string | undefined => {
    if ((this.domainRules.flags || []).includes('NO_KEY_MANAGER_PUB_LOOKUP')) {
      return undefined;
    }
    return this.domainRules.key_manager_url;
  }

  /**
   * use when finding out if EKM is in use, to change functionality without actually neededing the EKM
   *
   */
  public usesKeyManager = (): boolean => {
    return !!this.domainRules.key_manager_url;
  }

  // optional vars

  /**
   * Enforce a key algo for keygen, eg rsa2048,rsa4096,ecc25519
   */
  public getEnforcedKeygenAlgo = (): KeyAlgo | undefined => {
    return this.domainRules.enforce_keygen_algo as KeyAlgo | undefined;
  }

  /**
   * Some orgs want to have newly generated keys include self-signatures that expire some time in the future.
   */
  public getEnforcedKeygenExpirationMonths = (): number | undefined => {
    return this.domainRules.enforce_keygen_expire_months;
  }

  // bools

  /**
   * Some orgs expect 100% of their private keys to be imported from elsewhere (and forbid keygen in the extension)
   */
  public canCreateKeys = (): boolean => {
    return !(this.domainRules.flags || []).includes('NO_PRV_CREATE');
  }

  /**
   * Some orgs want to forbid backing up of public keys (such as inbox or other methods)
   */
  public canBackupKeys = (): boolean => {
    return !(this.domainRules.flags || []).includes('NO_PRV_BACKUP');
  }

  /**
   * (normally, during setup, if a public key is submitted to Attester and there is
   *    a conflicting key already submitted, the issue will be skipped)
   * Some orgs want to make sure that their public key gets submitted to attester and conflict errors are NOT ignored:
   */
  public mustSubmitToAttester = (): boolean => {
    return (this.domainRules.flags || []).includes('ENFORCE_ATTESTER_SUBMIT');
  }

  /**
   * Normally, during setup, "remember pass phrase" is unchecked
   * This option will cause "remember pass phrase" option to be checked by default
   * This behavior is also enabled as a byproduct of PASS_PHRASE_QUIET_AUTOGEN
   */
  public rememberPassPhraseByDefault = (): boolean => {
    return (this.domainRules.flags || []).includes('DEFAULT_REMEMBER_PASS_PHRASE') || this.mustAutogenPassPhraseQuietly();
  }

  /**
   * This is to be used for customers who run their own FlowCrypt Email Key Manager
   * If a key can be found on FEKM, it will be auto imported
   * If not, it will be autogenerated and stored there
   */
  public mustAutoImportOrAutogenPrvWithKeyManager = (): boolean => {
    if (!(this.domainRules.flags || []).includes('PRV_AUTOIMPORT_OR_AUTOGEN')) {
      return false;
    }
    if (!this.getKeyManagerUrlForPrivateKeys()) {
      throw new Error('Wrong org rules config: using PRV_AUTOIMPORT_OR_AUTOGEN without key_manager_url');
    }
    return true;
  }

  /**
   * When generating keys, user will not be prompted to choose a pass phrase
   * Instead a pass phrase will be automatically generated, and stored locally
   * The pass phrase will NOT be displayed to user, and it will never be asked of the user
   * This creates the smoothest user experience, for organisations that use full-disk-encryption and don't need pass phrase protection
   */
  public mustAutogenPassPhraseQuietly = (): boolean => {
    return (this.domainRules.flags || []).includes('PASS_PHRASE_QUIET_AUTOGEN');
  }

  /**
   * Some orgs prefer to forbid publishing public keys publicly
   */
  public canSubmitPubToAttester = (): boolean => {
    return !(this.domainRules.flags || []).includes('NO_ATTESTER_SUBMIT');
  }

  /**
   * Some orgs have a list of email domains where they do NOT want such emails to be looked up on public sources (such as Attester)
   * This is because they already have other means to obtain public keys for these domains, such as from their own internal keyserver
   */
  public canLookupThisRecipientOnAttester = (emailAddr: string): boolean => {
    return !(this.domainRules.disallow_attester_search_for_domains || []).includes(emailAddr.split('@')[1] || 'NONE');
  }

  /**
   * Some orgs use flows that are only implemented in POST /initial/legacy_submit and not in POST /pub/email@corp.co:
   *  -> enforcing that submitted keys match customer key server
   * Until the newer endpoint is ready, this flag will point users in those orgs to the original endpoint
   */
  public useLegacyAttesterSubmit = (): boolean => {
    return (this.domainRules.flags || []).includes('USE_LEGACY_ATTESTER_SUBMIT');
  }

}
