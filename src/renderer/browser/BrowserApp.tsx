import React, { useEffect } from 'react';
import { BrowserWorkspace } from '../features/browser/BrowserWorkspace';
import { applyTextScale } from '../theme/typography';

export const BrowserApp = (): React.JSX.Element => {
  useEffect(() => {
    void window.browserAPI.getAppearanceSettings().then((result) => {
      if (result.ok) {
        applyTextScale(result.data.textSize);
      }
    });
  }, []);

  return (
    <BrowserWorkspace
      mode="legacy-window"
      showLeftPanel={false}
      showCloseButton
    />
  );
};
