import React, { useState, useEffect, useRef } from 'react';
import { createPortal as renderInPortal } from 'react-dom';
import { RefreshCw } from 'lucide-react';

interface VersionCheckerProps {
  pollingInterval?: number; // in milliseconds, default to 5 minutes
}

const VersionChecker: React.FC<VersionCheckerProps> = ({ pollingInterval = 300000 }) => {
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const currentVersionRef = useRef<string | null>(null);
  const portalRoot = document.getElementById('portal-root');

  const fetchVersion = async () => {
    try {
      const response = await fetch('/version.json?t=' + new Date().getTime()); // Add cache-buster
      if (!response.ok) {
        console.warn(`Failed to fetch version.json: ${response.status}`);
        return null;
      }
      
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.warn('version.json returned non-JSON content, skipping version check');
        return null;
      }
      
      const data = await response.json();
      return data.version;
    } catch (error) {
      console.warn('Version check skipped:', error instanceof Error ? error.message : error);
      return null;
    }
  };

  useEffect(() => {
    // Fetch initial version on mount
    fetchVersion().then(version => {
      if (version) {
        currentVersionRef.current = version;
      }
    });

    const intervalId = setInterval(async () => {
      const latestVersion = await fetchVersion();
      if (latestVersion && currentVersionRef.current && latestVersion !== currentVersionRef.current) {
        setShowUpdateModal(true);
        clearInterval(intervalId); // Stop polling once update is detected
      }
    }, pollingInterval);

    return () => clearInterval(intervalId);
  }, [pollingInterval]);

  const handleReload = () => {
    window.location.reload();
  };

  if (!showUpdateModal || !portalRoot) {
    return null;
  }

  // Render the update modal using createPortal
  return renderInPortal(
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-[9999]">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full mx-4 p-6 text-center">
        <RefreshCw className="h-12 w-12 text-blue-600 mx-auto mb-4 animate-spin-slow" />
        <h3 className="text-xl font-bold text-gray-900 mb-2">Nova Versão Disponível!</h3>
        <p className="text-gray-700 mb-6">
          Uma nova versão da aplicação está disponível. Por favor, recarregue a página para obter as últimas atualizações.
        </p>
        <button
          onClick={handleReload}
          className="w-full px-4 py-3 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition-colors font-semibold flex items-center justify-center"
        >
          <RefreshCw className="h-5 w-5 mr-2" />
          Recarregar Agora
        </button>
      </div>
    </div>,
    portalRoot
  );
};

export default VersionChecker;