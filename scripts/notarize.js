// electron-builder afterSign hook. Runs after the macOS .app is signed and
// before it is packaged into the DMG.

const path = require('node:path');
const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;

  if (electronPlatformName !== 'darwin') {
    return;
  }

  if (!process.env.APPLE_API_KEY_PATH) {
    console.log('Skipping notarization: APPLE_API_KEY_PATH not set.');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  console.log(`Notarizing ${appName}...`);

  await notarize({
    appPath,
    appleApiKey: process.env.APPLE_API_KEY_PATH,
    appleApiKeyId: process.env.APPLE_API_KEY_ID,
    appleApiIssuer: process.env.APPLE_API_ISSUER,
  });

  console.log(`Notarization complete for ${appName}.`);
};
