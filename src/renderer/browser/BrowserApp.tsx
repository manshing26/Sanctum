import React from 'react';
import { BrowserWorkspace } from '../features/browser/BrowserWorkspace';

export const BrowserApp = (): React.JSX.Element => {
  return (
    <BrowserWorkspace
      mode="legacy-window"
      showLeftPanel={false}
      showCloseButton
    />
  );
};
