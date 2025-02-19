/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { Lifecycle, Messages, SandboxEvents, SandboxProcessObject, StatusEvent } from '@salesforce/core';
import { expect } from 'chai';

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('@salesforce/plugin-org', 'create');

let hubOrgUsername: string;

describe('Sandbox Orgs', () => {
  let session: TestSession;

  before(async () => {
    session = await TestSession.create({
      project: { name: 'sandboxCreate' },
    });

    const hubOrg = execCmd<[{ key: string; value: string }]>('config:get defaultdevhubusername --json', {
      cli: 'sfdx',
      ensureExitCode: 0,
    });
    hubOrgUsername = hubOrg.jsonOutput.result[0].value;
  });

  it('will create a sandbox, verify it can be opened, and then attempt to delete it', async () => {
    let result: SandboxProcessObject;
    try {
      Lifecycle.getInstance().on(SandboxEvents.EVENT_STATUS, async (results: StatusEvent) => {
        // eslint-disable-next-line no-console
        console.log('sandbox copy progress', results.sandboxProcessObj.CopyProgress);
      });
      result = execCmd<SandboxProcessObject>(
        // TODO: revert to org:create once out of beta
        `force:org:beta:create -a mySandbox -t sandbox -s licenseType='Developer' -w 60 -u ${hubOrgUsername} --json`,
        { timeout: 3600000 }
      ).jsonOutput.result;
      // autogenerated sandbox names start with 'sbx'
      expect(result.CopyProgress, 'org:create').to.equal(100);
      expect(result.SandboxName.startsWith('sbx'), 'org:create').to.be.true;
    } catch (e) {
      // there was a DNS issue, verify we handled it as best as we could
      expect(e.message, 'org:create DNS issue').to.include(messages.getMessage('partialSuccess'));
      expect(e.message, 'org:create DNS issue').to.include(messages.getMessage('dnsTimeout'));
      expect(e.exitCode, 'org:create DNS issue').to.equal(68);
    }
    const sandboxUsername = `${hubOrgUsername}.${result.SandboxName}`;
    // even if a DNS issue occurred, the sandbox should still be present and available.
    const openResult = execCmd<{ username: string }>('force:org:open -u mySandbox --urlonly --json', {
      ensureExitCode: 0,
    }).jsonOutput.result;
    expect(openResult, 'org:open').to.be.ok;
    expect(openResult.username, 'org:open').to.equal(sandboxUsername);

    const deleteResult = execCmd<{ username: string }>('force:org:delete -u mySandbox --noprompt --json', {
      ensureExitCode: 0,
    }).jsonOutput.result;
    expect(deleteResult, 'org:delete').to.be.ok;
    expect(deleteResult.username, 'org:delete').to.equal(sandboxUsername);
  });

  after(async () => {
    try {
      await session?.clean();
    } catch (e) {
      // do nothing, session?.clean() will try to remove files already removed by the org:delete and throw an error
      // it will also unwrap other stubbed methods
    }
  });
});
