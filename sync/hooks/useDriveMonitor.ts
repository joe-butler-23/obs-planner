import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  getStartPageToken, getFolderChanges, 
  mockGetStartPageToken, mockGetFolderChanges 
} from '../services/driveService';
import { DriveFile } from '../types';

interface UseDriveMonitorProps {
  isAuthenticated: boolean;
  isMonitoring: boolean;
  isDemo: boolean;
  sourceId: string;
  onNewFiles: (files: DriveFile[]) => void;
  onError: (error: string) => void;
}

/**
 * Hook that acts as a "listener" for Google Drive.
 * It uses the 'Changes' API pattern to efficiently detect new files.
 */
export const useDriveMonitor = ({
  isAuthenticated,
  isMonitoring,
  isDemo,
  sourceId,
  onNewFiles,
  onError
}: UseDriveMonitorProps) => {
  const [pageToken, setPageToken] = useState<string | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 1. When monitoring starts, get the "Start Token".
  // This tells us "ignore everything before this moment".
  useEffect(() => {
    const initializeToken = async () => {
      if (!isMonitoring || !isAuthenticated || !sourceId) return;

      try {
        const fetchTokenFn = isDemo ? mockGetStartPageToken : getStartPageToken;
        const token = await fetchTokenFn();
        setPageToken(token);
        console.log("Monitoring started with token:", token);
      } catch (err: any) {
        onError("Failed to initialize monitoring: " + err.message);
      }
    };

    if (isMonitoring && !pageToken) {
      initializeToken();
    } else if (!isMonitoring) {
      setPageToken(null);
    }
  }, [isMonitoring, isAuthenticated, sourceId, isDemo, pageToken, onError]);

  // 2. The "Polling Hook"
  // Once we have a token, we check for changes periodically using that token.
  // This is the standard pattern for emulating Webhooks in a client-side app.
  useEffect(() => {
    const checkChanges = async () => {
      if (!pageToken || !sourceId || !isMonitoring) return;

      try {
        const fetchChangesFn = isDemo ? mockGetFolderChanges : getFolderChanges;
        const { newFiles, nextToken } = await fetchChangesFn(pageToken, sourceId);

        if (newFiles.length > 0) {
          onNewFiles(newFiles);
        }

        // Update token so next time we only see *newer* things
        setPageToken(nextToken);

      } catch (err: any) {
        console.error("Change monitor error:", err);
        // Don't stop monitoring on transient errors, just log
      }
    };

    if (isMonitoring && pageToken) {
      // In Demo mode, we poll fast (2s) to show the effect.
      // In Real mode, 10s is a polite interval for the Changes API.
      const intervalMs = isDemo ? 2000 : 10000;
      
      pollIntervalRef.current = setInterval(checkChanges, intervalMs);
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [pageToken, isMonitoring, sourceId, isDemo, onNewFiles]);
};
