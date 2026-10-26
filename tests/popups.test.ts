import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('Frenzy and notification popups render with dedicated styling and admin previews', () => {
  const main = read('src/client/main.tsx');
  const styles = read('src/client/styles.css');
  const admin = read('src/client/components/DevDebugModal.tsx');

  assert.match(main, /showFrenzyPrompt && \(/);
  assert.match(main, /className="io-modal-card io-frenzy-prompt/);
  assert.match(main, /Post today’s Frenzy/);

  assert.match(main, /showNotificationPrompt && \(notificationPromptPreview \|\| !notificationsEnabled\) && \(/);
  assert.match(main, /className="io-modal-card io-notification-prompt/);
  assert.match(main, /data-testid="notification-prompt"/);
  assert.match(main, /aria-modal="true"/);
  assert.match(main, /Allow push notifications\?/);
  assert.match(main, /notification-prompt-enable/);
  assert.match(main, /notification-prompt-dismiss/);
  assert.match(main, /Admin Preview · Notification settings will not change/);

  assert.match(admin, /Popup Testing/);
  assert.match(admin, /Force Frenzy Popup/);
  assert.match(admin, /Preview Notification Popup/);
  assert.match(admin, /onForceNotificationPopup\?\.\(\)/);

  assert.match(styles, /\.io-frenzy-prompt\s*\{/);
  assert.match(styles, /\.io-notification-prompt\s*\{/);
  assert.match(styles, /\.io-notification-prompt-note\s*\{/);
});

test('notification prompt works for returning players and admin preview does not opt them in', () => {
  const main = read('src/client/main.tsx');
  const server = read('src/server/game.ts');
  const header = read('src/client/components/Header.tsx');

  assert.match(main, /const \[notificationsEnabled, setNotificationsEnabled\] = useState\(false\)/);
  assert.match(main, /We’ll only send notifications when your idle rewards are ready to claim or an Infinity Orbs update is ready\./);
  assert.match(main, /This prompt will only appear once\./);
  assert.match(main, /You can change your choice later with the bell icon\./);

  assert.match(main, /io-notification-prompt-shown-v2/);
  assert.match(main, /const \[notificationSettingsLoaded, setNotificationSettingsLoaded\] = useState\(false\)/);
  assert.match(main, /notificationSettingsLoaded/);
  assert.match(main, /Math\.max\(0, Number\(state\.totalRolls\) \|\| 0\) < 5/);
  assert.match(main, /!splashEntered/);
  assert.match(main, /const dismissNotificationPrompt = \(\) =>/);
  assert.match(main, /if \(notificationPromptPreview\)/);
  assert.match(main, /Preview closed; your notification setting was not changed\./);
  assert.match(main, /setNotificationPromptPreview\(true\)/);
  assert.doesNotMatch(main, /maybePromptForNotifications/);

  assert.match(header, /Enable Reddit notifications/);
  assert.match(header, /Disable Reddit notifications/);
  assert.match(server, /export async function getNotificationState/);
  assert.match(server, /return notifications\.isOptedIn\(id\)/);
  assert.match(server, /await notifications\.optInCurrentUser\(\)/);
  assert.match(server, /await notifications\.optOutCurrentUser\(\)/);
});
