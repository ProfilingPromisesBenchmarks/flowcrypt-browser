/* ©️ 2016 - present FlowCrypt a.s. Limitations apply. Contact human@flowcrypt.com */

'use strict';

import { ApiErr } from '../../../js/common/api/shared/api-error.js';
import { Assert } from '../../../js/common/assert.js';
import { Attachment } from '../../../js/common/core/attachment.js';
import { Browser } from '../../../js/common/browser/browser.js';
import { Buf } from '../../../js/common/core/buf.js';
import { KeyInfo, Key, KeyUtil } from '../../../js/common/core/crypto/key.js';
import { Ui } from '../../../js/common/browser/ui.js';
import { Url, Str } from '../../../js/common/core/common.js';
import { View } from '../../../js/common/view.js';
import { initPassphraseToggle } from '../../../js/common/ui/passphrase-ui.js';
import { PubLookup } from '../../../js/common/api/pub-lookup.js';
import { OrgRules } from '../../../js/common/org-rules.js';
import { PassphraseStore } from '../../../js/common/platform/store/passphrase-store.js';
import { KeyStore } from '../../../js/common/platform/store/key-store.js';
import { Xss } from '../../../js/common/platform/xss.js';
import { FlowCryptWebsite } from '../../../js/common/api/flowcrypt-website.js';

declare const ClipboardJS: any;

View.run(class MyKeyView extends View {

  private readonly acctEmail: string;
  private readonly fingerprint: string;
  private readonly myKeyUserIdsUrl: string;
  private readonly myKeyUpdateUrl: string;
  private keyInfo!: KeyInfo;
  private pubKey!: Key;
  private orgRules!: OrgRules;
  private pubLookup!: PubLookup;

  constructor() {
    super();
    const uncheckedUrlParams = Url.parse(['acctEmail', 'fingerprint', 'parentTabId']);
    this.acctEmail = Assert.urlParamRequire.string(uncheckedUrlParams, 'acctEmail');
    this.fingerprint = Assert.urlParamRequire.string(uncheckedUrlParams, 'fingerprint');
    this.myKeyUserIdsUrl = Url.create('my_key_user_ids.htm', uncheckedUrlParams);
    this.myKeyUpdateUrl = Url.create('my_key_update.htm', uncheckedUrlParams);
  }

  public render = async () => {
    this.orgRules = await OrgRules.newInstance(this.acctEmail);
    this.pubLookup = new PubLookup(this.orgRules);
    [this.keyInfo] = await KeyStore.get(this.acctEmail, [this.fingerprint]);
    Assert.abortAndRenderErrorIfKeyinfoEmpty(this.keyInfo);
    this.pubKey = await KeyUtil.parse(this.keyInfo.public);
    $('.action_view_user_ids').attr('href', this.myKeyUserIdsUrl);
    $('.action_view_update').attr('href', this.myKeyUpdateUrl);
    $('.fingerprint').text(Str.spaced(this.keyInfo.fingerprints[0]));
    Xss.sanitizeRender('.email', this.pubKey.emails.map(email => `<span>${Xss.escape(email)}</span>`).join(', '));
    const expiration = this.pubKey.expiration;
    $('.key_expiration').text(expiration && expiration !== Infinity ? Str.datetimeToDate(Str.fromDate(new Date(expiration))) : 'Key does not expire');
    await this.renderPrvKeyActions();
    await this.renderPubkeyShareableLink();
    await initPassphraseToggle(['input_passphrase']);
  }

  public setHandlers = () => {
    $('.action_download_pubkey').click(this.setHandlerPrevent('double', () => this.downloadPubKeyHandler()));
    $('.action_download_prv').click(this.setHandlerPrevent('double', () => this.downloadPrvKeyHandler()));
    $('.action_download_revocation_cert').click(this.setHandlerPrevent('double', () => this.downloadRevocationCert()));
    $('.action_continue_download').click(this.setHandlerPrevent('double', () => this.downloadRevocationCert(String($('#input_passphrase').val()))));
    $('#input_passphrase').on('keydown', this.setEnterHandlerThatClicks('.action_continue_download'));
    $('.action_cancel_download_cert').click(this.setHandler(() => { $('.enter_pp').hide(); }));
    const clipboardOpts = { text: () =>  this.keyInfo.public };
    new ClipboardJS('.action_copy_pubkey', clipboardOpts); // tslint:disable-line:no-unused-expression no-unsafe-any
  }

  private renderPubkeyShareableLink = async () => {
    try {
      const result = await this.pubLookup.attester.lookupEmail(this.acctEmail);
      const url = FlowCryptWebsite.url('pubkey', this.acctEmail);
      if (result.pubkey && (await KeyUtil.parse(result.pubkey)).id === this.keyInfo.fingerprints[0]) {
        $('.pubkey_link_container a').text(url.replace('https://', '')).attr('href', url).parent().css('display', '');
      } else {
        $('.pubkey_link_container').remove();
      }
    } catch (e) {
      ApiErr.reportIfSignificant(e);
      $('.pubkey_link_container').remove();
    }
  }

  private downloadRevocationCert = async (enteredPP?: string) => {
    const prv = await KeyUtil.parse(this.keyInfo.private);
    if (!prv.fullyDecrypted) {
      const passphrase = await PassphraseStore.get(this.acctEmail, this.keyInfo.fingerprints[0]) || enteredPP;
      if (passphrase) {
        if (! await KeyUtil.decrypt(prv, passphrase) && enteredPP) {
          await Ui.modal.error('Pass phrase did not match, please try again.');
          return;
        }
      } else {
        $('.enter_pp').show();
        return;
      }
    }
    $('.enter_pp').hide();
    $('#input_passphrase').val('');
    let revokeConfirmMsg = `Revocation cert is used when you want to revoke your Public Key (meaning you are asking others to stop using it).\n\n`;
    revokeConfirmMsg += `You can save it do your hard drive, and use it later in case you ever need it.\n\n`;
    revokeConfirmMsg += `Would you like to generate and save a revocation cert now?`;
    if (! await Ui.modal.confirm(revokeConfirmMsg)) {
      return;
    }
    const revokedArmored = await KeyUtil.revoke(prv);
    if (!revokedArmored) {
      await Ui.modal.error(`Could not produce revocation cert (empty)`);
      return;
    }
    const name = `${this.acctEmail.replace(/[^a-z0-9]+/g, '')}-0x${this.keyInfo.longid}.revocation-cert.asc`;
    const prvKeyAttachment = new Attachment({ data: Buf.fromUtfStr(revokedArmored), type: 'application/pgp-keys', name });
    Browser.saveToDownloads(prvKeyAttachment);
  }

  private downloadPubKeyHandler = () => {
    Browser.saveToDownloads(Attachment.keyinfoAsPubkeyAttachment(this.keyInfo));
  }

  private downloadPrvKeyHandler = () => {
    const name = `flowcrypt-backup-${this.acctEmail.replace(/[^A-Za-z0-9]+/g, '')}-0x${this.keyInfo.longid}.asc`;
    const prvKeyAttachment = new Attachment({ data: Buf.fromUtfStr(this.keyInfo.private), type: 'application/pgp-keys', name });
    Browser.saveToDownloads(prvKeyAttachment);
  }

  private renderPrvKeyActions = () => {
    if (!this.orgRules.usesKeyManager()) {
      $('.action_view_update').show();
      $('a.action_download_revocation_cert').show();
    } else {
      $('.enter_pp').remove();
    }
  }

});
