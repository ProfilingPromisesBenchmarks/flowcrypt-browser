/* ©️ 2016 - present FlowCrypt a.s. Limitations apply. Contact human@flowcrypt.com */

/* eslint-disable max-len */

/**
 * These tests use JavaScript instead of TypeScript to avoid dealing with types in cross-environment setup.
 * (tests are injected from NodeJS through puppeteer into a browser environment)
 * While this makes them less convenient to write, the result is more flexible.
 * 
 * Import your lib to `ci_unit_test.ts` to resolve `ReferenceError: SomeClass is not defined`
 * 
 * Each test must return "pass" to pass. To reject, throw an Error.
 * 
 * Each test must start with one of (depending on which flavors you want it to run): 
 *  - BROWSER_UNIT_TEST_NAME(`some test name`);
 *  - BROWSER_UNIT_TEST_NAME(`some test name`).enterprise;
 *  - BROWSER_UNIT_TEST_NAME(`some test name`).consumer;
 * 
 * This is not a JavaScript file. It's a text file that gets parsed, split into chunks, and
 *    parts of it executed as javascript. The structure is very rigid. The only flexible place is inside
 *    the async functions. For the rest, do not change the structure or our parser will get confused.
 *    Do not put any code whatsoever outside of the async functions.
 */

BROWSER_UNIT_TEST_NAME(`ContactStore is able to search by partial email address`);
(async () => {
  const contactABBDEF = await ContactStore.obj({
    email: 'abbdef@test.com', pubkey: testConstants.abbdefTestComPubkey
  });
  const contactABCDEF = await ContactStore.obj({
    email: 'abcdef@test.com', pubkey: testConstants.abcdefTestComPubkey
  });
  const contactABCDDF = await ContactStore.obj({
    email: 'abcddf@test.com', pubkey: testConstants.abcddfTestComPubkey
  });
  const contactABDDEF = await ContactStore.obj({
    email: 'abddef@test.com', pubkey: testConstants.abddefTestComPubkey
  });
  const contactABCDVWXYZHELLOCOM = await ContactStore.obj({
    email: 'abcd.vwxyz@hello.com', pubkey: testConstants.abcdVwxyzHelloComPubkey
  });
  await ContactStore.save(undefined, [contactABBDEF, contactABCDEF, contactABCDDF, contactABDDEF,
    contactABCDVWXYZHELLOCOM]);
  const contactsABC = await ContactStore.search(undefined, { hasPgp: true, substring: 'abc' });
  if (contactsABC.length !== 3) {
    throw Error(`Expected 3 contacts to match "abc" but got "${contactsABC.length}"`);
  }
  const contactsABCD = await ContactStore.search(undefined, { hasPgp: true, substring: 'abcd' });
  if (contactsABCD.length !== 3) {
    throw Error(`Expected 3 contacts to match "abcd" but got "${contactsABCD.length}"`);
  }
  const contactsABCDE = await ContactStore.search(undefined, { hasPgp: true, substring: 'abcde' });
  if (contactsABCDE.length !== 1) {
    throw Error(`Expected 1 contact to match "abcde" but got "${contactsABCDE.length}"`);
  }
  if (contactsABCDE[0].email !== 'abcdef@test.com') {
    throw Error(`Expected "abcdef@test.com" but got "${contactsABCDE[0].email}"`);
  }
  const contactsVWX = await ContactStore.search(undefined, { hasPgp: true, substring: 'vwx' });
  if (contactsVWX.length !== 1) {
    throw Error(`Expected 1 contact to match "vwx" but got "${contactsVWX.length}"`);
  }
  const contactsHEL = await ContactStore.search(undefined, { hasPgp: true, substring: 'hel' });
  if (contactsHEL.length !== 1) {
    throw Error(`Expected 1 contact to match "hel" but got "${contactsHEL.length}"`);
  }
  return 'pass';
})();

BROWSER_UNIT_TEST_NAME(`ContactStore doesn't store duplicates in searchable`);
(async () => {
  const db = await ContactStore.dbOpen();
  const contact = await ContactStore.obj({
    email: 'this.word.this.word@this.word.this.word', name: 'This Word THIS WORD this word'
  });
  await ContactStore.save(db, contact);
  // extract the entity from the database to see the actual field
  const entity = await new Promise((resolve, reject) => {
    const req = db.transaction(['emails'], 'readonly').objectStore('emails').get(contact.email);
    ContactStore.setReqPipe(req, resolve, reject);
  });
  if (entity?.searchable.length !== 2) {
    throw Error(`Expected 2 entries in 'searchable' but got "${entity?.searchable}"`);
  }
  return 'pass';
})();

BROWSER_UNIT_TEST_NAME(`ContactStore doesn't store smaller words in searchable when there is a bigger one that starts with it`);
(async () => {
  const db = await ContactStore.dbOpen();
  const contact = await ContactStore.obj({
    email: 'a@big.one', name: 'Bigger'
  });
  await ContactStore.save(db, contact);
  // extract the entity from the database to see the actual field
  const entity = await new Promise((resolve, reject) => {
    const req = db.transaction(['emails'], 'readonly').objectStore('emails').get(contact.email);
    ContactStore.setReqPipe(req, resolve, reject);
  });
  if (entity?.searchable.length !== 3 || !entity.searchable.includes('f:a')
    || !entity.searchable.includes('f:bigger') || !entity.searchable.includes('f:one')) {
    throw Error(`Expected "a bigger one" entries in 'searchable' but got "${entity?.searchable}"`);
  }
  return 'pass';
})();

BROWSER_UNIT_TEST_NAME(`ContactStore.update updates correct 'pubkeyLastCheck'`);
(async () => {
  const db = await ContactStore.dbOpen();
  const email = 'flowcrypt.compatibility@gmail.com';
  const date2_0 = Date.now();
  const contacts = [
    await ContactStore.obj({
      email,
      pubkey: testConstants.flowcryptcompatibilityPublicKey7FDE685548AEA788
    }),
    await ContactStore.obj({
      email,
      pubkey: testConstants.flowcryptcompatibilityPublicKeyADAC279C95093207,
      lastCheck: date2_0
    })];
  await ContactStore.save(db, contacts);
  // extract the entities from the database
  const fp1 = '5520CACE2CB61EA713E5B0057FDE685548AEA788';
  const fp2 = 'E8F0517BA6D7DAB6081C96E4ADAC279C95093207';
  const getEntity = async (fp) => {
    return await new Promise((resolve, reject) => {
      const req = db.transaction(['pubkeys'], 'readonly').objectStore('pubkeys').get(fp);
      ContactStore.setReqPipe(req, resolve, reject);
    });
  };
  let entity1 = await getEntity(fp1);
  let entity2 = await getEntity(fp2);
  if (entity1.fingerprint !== fp1) {
    throw Error(`Failed to extract pubkey ${fp1}`);
  }
  if (entity2.fingerprint !== fp2) {
    throw Error(`Failed to extract pubkey ${fp2}`);
  }
  if (entity1.lastCheck) {
    throw Error(`Expected undefined lastCheck for ${fp1} but got ${entity1.lastCheck}`);
  }
  if (entity2.lastCheck !== date2_0) {
    throw Error(`Expected lastCheck=${date2_0} for ${fp2} but got ${entity2.lastCheck}`);
  }
  const pubkey1 = await KeyUtil.parse(testConstants.flowcryptcompatibilityPublicKey7FDE685548AEA788);
  const pubkey2 = await KeyUtil.parse(testConstants.flowcryptcompatibilityPublicKeyADAC279C95093207);
  const date1_1 = date2_0 + 1000;
  // update entity 1 with pubkeyLastCheck = date1_1
  await ContactStore.update(db, email, { pubkeyLastCheck: date1_1, pubkey: pubkey1 });
  // extract the entities from the database
  entity1 = await getEntity(fp1);
  entity2 = await getEntity(fp2);
  if (entity1.lastCheck !== date1_1) {
    throw Error(`Expected lastCheck=${date1_1} for ${fp1} but got ${entity1.lastCheck}`);
  }
  if (entity2.lastCheck !== date2_0) {
    throw Error(`Expected lastCheck=${date2_0} for ${fp2} but got ${entity2.lastCheck}`);
  }
  const date2_2 = date1_1 + 10000;
  // updating with undefined value shouldn't modify pubkeyLastCheck
  await ContactStore.update(db, email, { pubkeyLastCheck: undefined, pubkey: pubkey1 });
  await ContactStore.update(db, email, { pubkeyLastCheck: date2_2, pubkey: pubkey2 });
  // extract the entities from the database
  entity1 = await getEntity(fp1);
  entity2 = await getEntity(fp2);
  if (entity1.lastCheck !== date1_1) {
    throw Error(`Expected lastCheck=${date1_1} for ${fp1} but got ${entity1.lastCheck}`);
  }
  if (entity2.lastCheck !== date2_2) {
    throw Error(`Expected lastCheck=${date2_2} for ${fp2} but got ${entity2.lastCheck}`);
  }
  // updating contact details without specifying a pubkey shouln't update pubkeyLastCheck
  await ContactStore.update(db, email, { name: 'Some Name' });
  // extract the entities from the database
  entity1 = await getEntity(fp1);
  entity2 = await getEntity(fp2);
  if (entity1.lastCheck !== date1_1) {
    throw Error(`Expected lastCheck=${date1_1} for ${fp1} but got ${entity1.lastCheck}`);
  }
  if (entity2.lastCheck !== date2_2) {
    throw Error(`Expected lastCheck=${date2_2} for ${fp2} but got ${entity2.lastCheck}`);
  }
  return 'pass';
})();

BROWSER_UNIT_TEST_NAME(`ContactStore.update tests`);
(async () => {
  const db = await ContactStore.dbOpen();
  const email1 = 'email1@test.com';
  const email2 = 'email2@test.com';
  const contacts = [
    await ContactStore.obj({ email: email1 }),
    await ContactStore.obj({ email: email2 })];
  await ContactStore.save(db, contacts);
  const expectedObj1 = {
    email: email1,
    name: undefined,
    lastUse: undefined
  };
  const expectedObj2 = {
    email: email2,
    name: undefined,
    lastUse: undefined
  };
  const getEntity = async (email) => {
    return await new Promise((resolve, reject) => {
      const req = db.transaction(['emails'], 'readonly').objectStore('emails').get(email);
      ContactStore.setReqPipe(req, resolve, reject);
    });
  };
  const compareEntity = async (expectedObj) => {
    const loaded = await getEntity(expectedObj.email);
    if (loaded.name != expectedObj.name) {
      throw Error(`name field mismatch, expected ${expectedObj.name} but got ${loaded.name}`);
    }
    if (loaded.lastUse != expectedObj.lastUse) {
      throw Error(`lastUse field mismatch, expected ${expectedObj.lastUse} but got ${loaded.lastUse}`);
    }
  };
  const compareEntities = async () => {
    await compareEntity(expectedObj1);
    await compareEntity(expectedObj2);
  };
  await compareEntities();
  expectedObj1.name = 'New Name for contact 1';
  await ContactStore.update(db, email1, { name: expectedObj1.name });
  await compareEntities();
  await ContactStore.update(db, email1, { name: undefined }); // won't affect the entity
  await compareEntities();
  const date = new Date();
  expectedObj2.lastUse = date.getTime();
  await ContactStore.update(db, email2, { lastUse: date });
  await compareEntities();
  await ContactStore.update(db, email2, { lastUse: undefined }); // won't affect the entity
  await compareEntities();
  return 'pass';
})();

BROWSER_UNIT_TEST_NAME(`ContactStore saves and returns dates as numbers`);
(async () => {
  // we'll use background operation to make sure the date isn't transformed on its way
  const email = 'test@expired.com';
  const lastCheck = Date.now();
  const lastUse = lastCheck + 1000;
  const contact = await ContactStore.obj({ email, pubkey: testConstants.expiredPub, lastCheck, lastUse });
  await ContactStore.save(undefined, [contact]);
  const [loaded] = await ContactStore.get(undefined, [email]);
  if (typeof loaded.lastUse !== 'number') {
    throw Error(`lastUse was expected to be a number, but got ${typeof loaded.lastUse}`);
  }
  if (typeof loaded.pubkeyLastCheck !== 'number') {
    throw Error(`pubkeyLastCheck was expected to be a number, but got ${typeof loaded.pubkeyLastCheck}`);
  }
  if (typeof loaded.expiresOn !== 'number') {
    throw Error(`expiresOn was expected to be a number, but got ${typeof loaded.expiresOn}`);
  }
  return 'pass';
})();

BROWSER_UNIT_TEST_NAME(`ContactStore gets a contact by any longid`);
(async () => {
  const contactABBDEF = await ContactStore.obj({
    email: 'abbdef@test.com', pubkey: testConstants.abbdefTestComPubkey
  });
  const contactABCDEF = await ContactStore.obj({
    email: 'abcdef@test.com', pubkey: testConstants.abcdefTestComPubkey
  });
  const contactABCDDF = await ContactStore.obj({
    email: 'abcddf@test.com', pubkey: testConstants.abcddfTestComPubkey
  });
  const contactABDDEF = await ContactStore.obj({
    email: 'abddef@test.com', pubkey: testConstants.abddefTestComPubkey
  });
  await ContactStore.save(undefined, [contactABBDEF, contactABCDEF, contactABCDDF, contactABDDEF]);
  const [abbdefByPrimaryLongid] = await ContactStore.get(undefined, ['DF63659C3B4A81FB']);
  if (abbdefByPrimaryLongid.email !== 'abbdef@test.com') {
    throw Error(`Expected to get the key for abbdef@test.com by primary longid but got ${abbdefByPrimaryLongid.email}`);
  }
  if (abbdefByPrimaryLongid.pubkey.id !== 'B790AE8F425DC44633A8C086DF63659C3B4A81FB') {
    throw Error(`Expected to get the key fingerprint B790AE8F425DC44633A8C086DF63659C3B4A81FB but got ${abbdefByPrimaryLongid.pubkey.id}`);
  }
  const [abbdefBySubkeyLongid] = await ContactStore.get(undefined, ['621DE1814AD675E0']);
  if (abbdefBySubkeyLongid.email !== 'abbdef@test.com') {
    throw Error(`Expected to get the key for abbdef@test.com by subkey longid but got ${abbdefBySubkeyLongid.email}`);
  }
  if (abbdefBySubkeyLongid.pubkey.id !== 'B790AE8F425DC44633A8C086DF63659C3B4A81FB') {
    throw Error(`Expected to get the key fingerprint B790AE8F425DC44633A8C086DF63659C3B4A81FB but got ${abbdefBySubkeyLongid.pubkey.id}`);
  }

  const [abcdefByPrimaryLongid] = await ContactStore.get(undefined, ['608BCD797A23FB91']);
  if (abcdefByPrimaryLongid.email !== 'abcdef@test.com') {
    throw Error(`Expected to get the key for abcdef@test.com by primary longid but got ${abcdefByPrimaryLongid.email}`);
  }
  if (abcdefByPrimaryLongid.pubkey.id !== '3155F118B6E732B3638A1CE1608BCD797A23FB91') {
    throw Error(`Expected to get the key fingerprint 3155F118B6E732B3638A1CE1608BCD797A23FB91 but got ${abcdefByPrimaryLongid.pubkey.id}`);
  }
  const [abcdefBySubkeyLongid] = await ContactStore.get(undefined, ['2D47A41943DFAFCE']);
  if (abcdefBySubkeyLongid.email !== 'abcdef@test.com') {
    throw Error(`Expected to get the key for abcdef@test.com by subkey longid but got ${abcdefBySubkeyLongid.email}`);
  }
  if (abcdefBySubkeyLongid.pubkey.id !== '3155F118B6E732B3638A1CE1608BCD797A23FB91') {
    throw Error(`Expected to get the key fingerprint 3155F118B6E732B3638A1CE1608BCD797A23FB91 but got ${abcdefBySubkeyLongid.pubkey.id}`);
  }

  const [abcddfByPrimaryLongid] = await ContactStore.get(undefined, ['75AA44AB8930F7E9']);
  if (abcddfByPrimaryLongid.email !== 'abcddf@test.com') {
    throw Error(`Expected to get the key for abcddf@test.com by primary longid but got ${abcddfByPrimaryLongid.email}`);
  }
  if (abcddfByPrimaryLongid.pubkey.id !== '6CF53D2329C2A80828F499D375AA44AB8930F7E9') {
    throw Error(`Expected to get the key fingerprint 6CF53D2329C2A80828F499D375AA44AB8930F7E9 but got ${abcddfByPrimaryLongid.pubkey.id}`);
  }
  const [abcddfBySubkeyLongid] = await ContactStore.get(undefined, ['92CFDAC7AA3A4253']);
  if (abcddfBySubkeyLongid.email !== 'abcddf@test.com') {
    throw Error(`Expected to get the key for abcddf@test.com by subkey longid but got ${abcddfBySubkeyLongid.email}`);
  }
  if (abcddfBySubkeyLongid.pubkey.id !== '6CF53D2329C2A80828F499D375AA44AB8930F7E9') {
    throw Error(`Expected to get the key fingerprint 6CF53D2329C2A80828F499D375AA44AB8930F7E9 but got ${abcddfBySubkeyLongid.pubkey.id}`);
  }

  const [abddefByPrimaryLongid] = await ContactStore.get(undefined, ['5FCC1541CF282951']);
  if (abddefByPrimaryLongid.email !== 'abddef@test.com') {
    throw Error(`Expected to get the key for abddef@test.com by primary longid but got ${abddefByPrimaryLongid.email}`);
  }
  if (abddefByPrimaryLongid.pubkey.id !== '9E020D9B752FD3FFF17ED9B65FCC1541CF282951') {
    throw Error(`Expected to get the key fingerprint 9E020D9B752FD3FFF17ED9B65FCC1541CF282951 but got ${abddefByPrimaryLongid.pubkey.id}`);
  }
  const [abddefBySubkeyLongid] = await ContactStore.get(undefined, ['EAA7A05FE34F3A1A']);
  if (abddefBySubkeyLongid.email !== 'abddef@test.com') {
    throw Error(`Expected to get the key for abddef@test.com by subkey longid but got ${abddefBySubkeyLongid.email}`);
  }
  if (abddefBySubkeyLongid.pubkey.id !== '9E020D9B752FD3FFF17ED9B65FCC1541CF282951') {
    throw Error(`Expected to get the key fingerprint 9E020D9B752FD3FFF17ED9B65FCC1541CF282951 but got ${abddefBySubkeyLongid.pubkey.id}`);
  }
  return 'pass';
})();

BROWSER_UNIT_TEST_NAME(`ContactStore gets a valid pubkey by e-mail, or exact pubkey by longid`);
(async () => {
  // Note 1: email differs from pubkey id
  // Note 2: not necessary to call ContactStore.save, it's possible to always use ContactStore.update
  await ContactStore.update(undefined, 'some.revoked@otherhost.com', { pubkey: await KeyUtil.parse(testConstants.somerevokedRevoked1) });
  await ContactStore.update(undefined, 'some.revoked@otherhost.com', { pubkey: await KeyUtil.parse(testConstants.somerevokedValid) });
  await ContactStore.update(undefined, 'some.revoked@otherhost.com', { pubkey: await KeyUtil.parse(testConstants.somerevokedRevoked2) });

  const [expectedValid] = await ContactStore.get(undefined, ['some.revoked@otherhost.com']);
  if (expectedValid.pubkey.id !== 'D6662C5FB9BDE9DA01F3994AAA1EF832D8CCA4F2') {
    throw Error(`Expected to get the key fingerprint D6662C5FB9BDE9DA01F3994AAA1EF832D8CCA4F2 but got ${expectedValid.pubkey.id}`);
  }
  const [expectedRevoked1] = await ContactStore.get(undefined, ['097EEBF354259A5E']);
  if (expectedRevoked1.pubkey.id !== 'A5CFC8E8EA4AE69989FE2631097EEBF354259A5E') {
    throw Error(`Expected to get the key fingerprint A5CFC8E8EA4AE69989FE2631097EEBF354259A5E but got ${expectedRevoked1.pubkey.id}`);
  }
  const [expectedRevoked2] = await ContactStore.get(undefined, ['DE8538DDA1648C76']);
  if (expectedRevoked2.pubkey.id !== '3930752556D57C46A1C56B63DE8538DDA1648C76') {
    throw Error(`Expected to get the key fingerprint 3930752556D57C46A1C56B63DE8538DDA1648C76 but got ${expectedRevoked2.pubkey.id}`);
  }
  return 'pass';
})();

BROWSER_UNIT_TEST_NAME(`ContactStore stores postfixed fingerprint internally for X.509 certificate`);
(async () => {
  const db = await ContactStore.dbOpen();
  const email = 'actalis@meta.33mail.com';
  const contacts = [
    await ContactStore.obj({
      email,
      pubkey: testConstants.expiredSmimeCert
    })];
  await ContactStore.save(db, contacts);
  // extract the entity directly from the database
  const entityFp = '16BB407403A3ADC55E1E0E4AF93EEC8FB187C923-X509';
  const fingerprint = '16BB407403A3ADC55E1E0E4AF93EEC8FB187C923';
  const longid = 'X509-MIGiMIGNMQswCQYDVQQGEwJJVDEQMA4GA1UECAwHQmVyZ2FtbzEZMBcGA1UEBwwQUG9udGUgU2Fu' +
    'IFBpZXRybzEjMCEGA1UECgwaQWN0YWxpcyBTLnAuQS4vMDMzNTg1MjA5NjcxLDAqBgNVBAMMI0FjdGFsaXMgQ2xpZW50IE' +
    'F1dGhlbnRpY2F0aW9uIENBIEcyAhBj9wJecA85RTAfsvulZ0+E';
  const entity = await new Promise((resolve, reject) => {
    const req = db.transaction(['pubkeys'], 'readonly').objectStore('pubkeys').get(entityFp);
    ContactStore.setReqPipe(req, resolve, reject);
  });
  if (entity.fingerprint !== entityFp) {
    throw Error(`Failed to extract pubkey ${fingerprint}`);
  }
  const [contactByLongid] = await ContactStore.get(db, [longid]);
  if (contactByLongid.pubkey.id !== fingerprint) {
    throw Error(`Failed to extract pubkey ${fingerprint}`);
  }
  const [contactByEmail] = await ContactStore.get(db, [email]);
  if (contactByEmail.pubkey.id !== fingerprint) {
    throw Error(`Failed to extract pubkey ${fingerprint}`);
  }
  return 'pass';
})();

BROWSER_UNIT_TEST_NAME(`ContactStore searches S/MIME Certificate by PKCS#7 message recipient`);
(async () => {
  const db = await ContactStore.dbOpen();
  const email = 'actalis@meta.33mail.com';
  const pubkey = testConstants.expiredSmimeCert;
  const contacts = [await ContactStore.obj({ email, pubkey })];
  await ContactStore.save(db, contacts);
  const p7 = forge.pkcs7.createEnvelopedData();
  const certificate = forge.pki.certificateFromPem(pubkey);
  p7.addRecipient(certificate);
  const recipient = p7.recipients[0];
  const issuerAndSerialNumberAsn1 =
    forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
      // Name
      forge.pki.distinguishedNameToAsn1({ attributes: recipient.issuer }),
      // Serial
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.INTEGER, false,
        forge.util.hexToBytes(recipient.serialNumber))
    ]);
  const der = forge.asn1.toDer(issuerAndSerialNumberAsn1).getBytes();
  const buf = Buf.fromRawBytesStr(der);
  const [contact] = await ContactStore.get(db, ['X509-' + buf.toBase64Str()]);
  const foundCert = KeyUtil.armor(contact.pubkey);
  console.log('foundCert');
  console.log(foundCert);
  if (foundCert !== pubkey) {
    throw new Error(`The certificate wasn't found by S/MIME IssuerAndSerialNumber`);
  }
  return 'pass';
})();

BROWSER_UNIT_TEST_NAME(`ContactStore: X-509 revocation affects OpenPGP key`);
(async () => {
  const db = await ContactStore.dbOpen();
  const opgpKeyOldAndValid = await KeyUtil.parse(testConstants.somerevokedValid);
  const fingerprint = 'D6662C5FB9BDE9DA01F3994AAA1EF832D8CCA4F2';
  if (opgpKeyOldAndValid.id !== fingerprint) {
    throw new Error(`Valid OpenPGP Key is expected to have fingerprint ${fingerprint} but actually is ${opgpKeyOldAndValid.id}`);
  }
  await ContactStore.update(db, 'some.revoked@localhost.com', { pubkey: opgpKeyOldAndValid });
  const [loadedOpgpKey1] = await ContactStore.get(db, [`some.revoked@localhost.com`]);
  if (loadedOpgpKey1.pubkey.revoked) {
    throw new Error(`The loaded OpenPGP Key (1) was expected to be valid but it is revoked.`);
  }
  const [loadedOpgpKey2] = await ContactStore.get(db, [`AA1EF832D8CCA4F2`]);
  if (loadedOpgpKey2.pubkey.revoked) {
    throw new Error(`The loaded OpenPGP Key (2) was expected to be valid but it is revoked.`);
  }
  // emulate X-509 revocation
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['revocations'], 'readwrite');
    ContactStore.setTxHandlers(tx, resolve, reject);
    tx.objectStore('revocations').put({ fingerprint: fingerprint + "-X509" });
  });
  // original key should be either revoked or missing
  const [loadedOpgpKey3] = await ContactStore.get(db, [`some.revoked@localhost.com`]);
  if (loadedOpgpKey3.pubkey && !loadedOpgpKey3.pubkey.revoked) {
    throw new Error(`The loaded OpenPGP Key (3) was expected to be revoked but it is not.`);
  }
  const [loadedOpgpKey4] = await ContactStore.get(db, [`AA1EF832D8CCA4F2`]);
  if (loadedOpgpKey4.pubkey && !loadedOpgpKey4.pubkey.revoked) {
    throw new Error(`The loaded OpenPGP Key (4) was expected to be revoked but it is not.`);
  }
  return 'pass';
})();

BROWSER_UNIT_TEST_NAME(`ContactStore: OpenPGP revocation affects X.509 certificate`);
(async () => {
  const db = await ContactStore.dbOpen();
  const smimeKey = await KeyUtil.parse(testConstants.expiredSmimeCert);
  await ContactStore.update(db, 'actalis@meta.33mail.com', { pubkey: smimeKey });
  const [loadedCert1] = await ContactStore.get(db, [`actalis@meta.33mail.com`]);
  const longid = KeyUtil.getPrimaryLongid(smimeKey);
  if (loadedCert1.pubkey.revoked) {
    throw new Error(`The loaded X.509 certificate (1) was expected to be valid but it is revoked.`);
  }
  const [loadedCert2] = await ContactStore.get(db, [longid]);
  if (loadedCert2.pubkey.revoked) {
    throw new Error(`The loaded X.509 certificate (2) was expected to be valid but it is revoked.`);
  }
  // emulate openPGP revocation
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['revocations'], 'readwrite');
    ContactStore.setTxHandlers(tx, resolve, reject);
    tx.objectStore('revocations').put({ fingerprint: ContactStore.stripFingerprint(smimeKey.id) });
  });
  // original key should be either revoked or missing
  const [loadedCert3] = await ContactStore.get(db, [`actalis@meta.33mail.com`]);
  if (loadedCert3.pubkey && !loadedCert3.pubkey.revoked) {
    throw new Error(`The loaded X.509 certificate (3) was expected to be revoked but it is not.`);
  }
  const [loadedCert4] = await ContactStore.get(db, [longid]);
  if (loadedCert4.pubkey && !loadedCert4.pubkey.revoked) {
    throw new Error(`The loaded X.509 certificate (4) was expected to be revoked but it is not.`);
  }
  return 'pass';
})();

BROWSER_UNIT_TEST_NAME(`ContactStore doesn't replace revoked key with older version`);
(async () => {
  const db = await ContactStore.dbOpen();
  const opgpKeyOldAndValid = await KeyUtil.parse(testConstants.somerevokedValid);
  const fingerprint = 'D6662C5FB9BDE9DA01F3994AAA1EF832D8CCA4F2';
  if (opgpKeyOldAndValid.id !== fingerprint) {
    throw new Error(`Valid OpenPGP Key is expected to have fingerprint ${fingerprint} but actually is ${opgpKeyOldAndValid.id}`);
  }
  const opgpKeyRevoked = await KeyUtil.parse(testConstants.somerevokedValidNowRevoked);
  if (opgpKeyRevoked.id !== fingerprint) {
    throw new Error(`RevokedOpenPGP Key is expected to have fingerprint ${fingerprint} but actually is ${opgpKeyRevoked.id}`);
  }
  await ContactStore.update(db, 'some.revoked@localhost.com', { pubkey: opgpKeyOldAndValid });
  const [loadedOpgpKey1] = await ContactStore.get(db, [`some.revoked@localhost.com`]);
  if (loadedOpgpKey1.pubkey.revoked) {
    throw new Error(`The loaded OpenPGP Key (1) was expected to be valid but it is revoked.`);
  }
  const [loadedOpgpKey2] = await ContactStore.get(db, [`AA1EF832D8CCA4F2`]);
  if (loadedOpgpKey2.pubkey.revoked) {
    throw new Error(`The loaded OpenPGP Key (2) was expected to be valid but it is revoked.`);
  }
  await ContactStore.update(db, 'some.revoked@localhost.com', { pubkey: opgpKeyRevoked });
  const [loadedOpgpKey3] = await ContactStore.get(db, [`some.revoked@localhost.com`]);
  if (loadedOpgpKey3.pubkey && !loadedOpgpKey3.pubkey.revoked) {
    throw new Error(`The loaded OpenPGP Key (3) was expected to be revoked but it is not.`);
  }
  const [loadedOpgpKey4] = await ContactStore.get(db, [`AA1EF832D8CCA4F2`]);
  if (loadedOpgpKey4.pubkey && !loadedOpgpKey4.pubkey.revoked) {
    throw new Error(`The loaded OpenPGP Key (4) was expected to be revoked but it is not.`);
  }
  await ContactStore.update(db, 'some.revoked@localhost.com', { pubkey: opgpKeyOldAndValid });
  const [loadedOpgpKey5] = await ContactStore.get(db, [`some.revoked@localhost.com`]);
  if (loadedOpgpKey5.pubkey && !loadedOpgpKey5.pubkey.revoked) {
    throw new Error(`The loaded OpenPGP Key (5) was expected to be revoked but it is not.`);
  }
  const [loadedOpgpKey6] = await ContactStore.get(db, [`AA1EF832D8CCA4F2`]);
  if (loadedOpgpKey6.pubkey && !loadedOpgpKey6.pubkey.revoked) {
    throw new Error(`The loaded OpenPGP Key (6) was expected to be revoked but it is not.`);
  }
  return 'pass';
})();

BROWSER_UNIT_TEST_NAME(`ContactStore searchPubkeys { hasPgp: true } returns all keys`);
(async () => {
  const db = await ContactStore.dbOpen();
  const contactABBDEF = await ContactStore.obj({
    email: 'abbdef@test.com', pubkey: testConstants.abbdefTestComPubkey
  });
  const contactABCDEF = await ContactStore.obj({
    email: 'abcdef@test.com', pubkey: testConstants.abcdefTestComPubkey
  });
  const contactABCDDF = await ContactStore.obj({
    email: 'abcddf@test.com', pubkey: testConstants.abcddfTestComPubkey
  });
  const contactABDDEF = await ContactStore.obj({
    email: 'abddef@test.com', pubkey: testConstants.abddefTestComPubkey
  });
  await ContactStore.save(db, [contactABBDEF, contactABCDEF, contactABCDDF, contactABDDEF]);
  const foundKeys = await ContactStore.searchPubkeys(db, { hasPgp: true });
  const fingerprints = (await Promise.all(foundKeys.map(async (key) => await KeyUtil.parse(key)))).
    map(pk => pk.id);
  if (!fingerprints.includes('B790AE8F425DC44633A8C086DF63659C3B4A81FB')
    || !fingerprints.includes('3155F118B6E732B3638A1CE1608BCD797A23FB91')
    || !fingerprints.includes('6CF53D2329C2A80828F499D375AA44AB8930F7E9')
    || !fingerprints.includes('9E020D9B752FD3FFF17ED9B65FCC1541CF282951')) {
    throw new Error('Some keys were not loaded!');
  }
  return 'pass';
})();
