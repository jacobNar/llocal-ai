import React, { useContext } from 'react';
import { AppContext } from '../../contexts/AppContext';
import BasicChat from '../apps/BasicChat/BasicChat';
// import BasicChat from './BasicChat';
// import FileChat from './FileChat';
import WebsiteChat from '../apps/WebsiteChat/WebsiteChat';
import Workflows from '../apps/Workflows/Workflows';

const Dashboard = () => {
  const { activeApp } = useContext(AppContext);

  const renderActiveApp = () => {
    switch (activeApp) {
      case 'chat':
        return <BasicChat />;
      case 'file-chat':
        // return <FileChat />;
        return "File Chat"
      case 'website-chat':
        return <WebsiteChat />;
      case 'workflows':
        return <Workflows />;
      default:
        return (
          <div className="p-6 text-center text-gray-400">
            <p>Select an app from the menu to get started</p>
          </div>
        );
    }
  };

  return (
    <>
      {renderActiveApp()}
    </>
  );
};

export default Dashboard;
