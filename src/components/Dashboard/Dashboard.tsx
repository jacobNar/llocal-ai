import React, { useContext } from 'react';
import { AppContext } from '../../contexts/AppContext';
// import BasicChat from './BasicChat';
// import FileChat from './FileChat';
// import WebsiteChat from './WebsiteChat';

const Dashboard = () => {
  const { activeApp } = useContext(AppContext);

  const renderActiveApp = () => {
    switch (activeApp) {
      case 'chat':
        // return <BasicChat />;
        return "Basic Chat"
      case 'file-chat':
        // return <FileChat />;
        return "File Chat"
      case 'website-chat':
        return "Website Chat"
        // return <WebsiteChat />;
      default:
        return (
          <div className="p-6 text-center text-gray-400">
            <p>Select an app from the menu to get started</p>
          </div>
        );
    }
  };

  return (
    <div className="flex-1 overflow-auto bg-white rounded-lg shadow-sm">
      {renderActiveApp()}
    </div>
  );
};

export default Dashboard;
