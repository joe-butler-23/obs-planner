import React, { useState, useEffect, useCallback } from 'react';
import { DISCOVERY_DOCS, SCOPES, SUPPORTED_MIME_TYPES } from './constants';
import { ActivityLog } from './components/ActivityLog';
import { FolderSelector } from './components/FolderSelector';
import { 
  getFileContent, saveProcessedRecipe, checkFileExists, waitForGapi, moveFile, getProcessedFolderId,
  mockGetFileContent, mockSaveRecipe, mockCheckFileExists, listFiles, mockListFiles,
  injectMockFile
} from './services/driveService';
import { parseRecipeWithGemini, generateMarkdown } from './services/geminiService';
import { ProcessingLog, FileStatus, DriveFile, ProcessedRecipe } from './types';
import { useDriveMonitor } from './hooks/useDriveMonitor';
import { ChefHat, Play, Pause, LogOut, TestTube, ScanSearch, Link, FilePlus, Smartphone, AlertTriangle, HelpCircle, Settings, Save } from 'lucide-react';
import { RECIPE_JSON_SCHEMA_PROMPT } from './constants';

// Get env variables
const ENV_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const ENV_SOURCE_FOLDER = process.env.SOURCE_FOLDER_ID || '';
const ENV_DEST_FOLDER = process.env.DESTINATION_FOLDER_ID || '';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [clientId, setClientId] = useState(ENV_CLIENT_ID);
  
  // Pre-filled from env variables
  const [sourceId, setSourceId] = useState(ENV_SOURCE_FOLDER);
  const [destId, setDestId] = useState(ENV_DEST_FOLDER);
  
  // Editable Gemini prompt - load from localStorage if available
  const [geminiPrompt, setGeminiPrompt] = useState(() => {
    const saved = localStorage.getItem('geminiPrompt');
    return saved || RECIPE_JSON_SCHEMA_PROMPT.trim();
  });
  const [showSettings, setShowSettings] = useState(false);
  
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<ProcessingLog[]>([]);
  
  // Track files currently being processed to prevent duplicates
  const [processingFileIds, setProcessingFileIds] = useState<Set<string>>(new Set());
  
  // Demo Mode Inputs
  const [demoUrl, setDemoUrl] = useState('https://www.foodnetwork.com/recipes/food-network-kitchen/pan-seared-salmon-with-kale-and-apple-salad-recipe-3381583');

  // Debugging Helpers
  const [currentOrigin, setCurrentOrigin] = useState('');
  const [gapiLoaded, setGapiLoaded] = useState(false);

  // Initialize Google Identity Services & GAPI with token persistence
  useEffect(() => {
    setCurrentOrigin(window.location.origin);

    const initGapi = async () => {
      // 1. Wait for gapi script to be available on window
      await new Promise<void>((resolve) => {
        if (window.gapi) resolve();
        else {
           const interval = setInterval(() => {
             if (window.gapi) { clearInterval(interval); resolve(); }
           }, 100);
        }
      });

      // 2. Load the client library
      await new Promise<void>((resolve) => {
        window.gapi.load('client', resolve);
      });

      // 3. Initialize the client with discovery docs
      try {
        await window.gapi.client.init({
          discoveryDocs: DISCOVERY_DOCS,
        });
        setGapiLoaded(true);
        console.log("GAPI Client Initialized");
        
        // 4. Try to restore saved token
        const savedToken = localStorage.getItem('gapi_access_token');
        const savedExpiry = localStorage.getItem('gapi_token_expiry');
        
        if (savedToken && savedExpiry) {
          const expiryTime = parseInt(savedExpiry, 10);
          const now = Date.now();
          
          if (now < expiryTime) {
            // Token is still valid, restore it
            console.log("Restoring saved access token...");
            window.gapi.client.setToken({ access_token: savedToken });
            setIsAuthenticated(true);
            setIsDemo(false);
            console.log("✓ Auto-logged in with saved token");
          } else {
            // Token expired, clear storage
            console.log("Saved token expired, clearing...");
            localStorage.removeItem('gapi_access_token');
            localStorage.removeItem('gapi_token_expiry');
          }
        }
      } catch (e) {
        console.error("Error initializing GAPI client", e);
      }
    };
    initGapi();
  }, []);

  const handleAuthClick = () => {
    if (!clientId) {
      alert("Please enter a Google Cloud Client ID first.");
      return;
    }

    if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
      alert("Google Identity Services script not loaded yet. Please refresh.");
      return;
    }

    // Check if this is a Web Application Client ID (starts with numbers)
    const isWebClientId = /^\d+\-/.test(clientId);
    
    if (!isWebClientId) {
      alert("Please use a Web Application Client ID (starts with numbers followed by a dash). Desktop/Native client IDs won't work for web apps.");
      return;
    }

    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: async (response: any) => {
        if (response.error !== undefined) {
          console.error("OAuth Error:", response);
          alert(`Authentication failed: ${response.error_description || response.error}`);
          return;
        }
        
        // Save token to localStorage for persistence
        const expiresIn = response.expires_in || 3600; // Default 1 hour
        const expiryTime = Date.now() + (expiresIn * 1000);
        localStorage.setItem('gapi_access_token', response.access_token);
        localStorage.setItem('gapi_token_expiry', expiryTime.toString());
        console.log("✓ Token saved for auto-login");
        
        setIsAuthenticated(true);
        setIsDemo(false);
      },
    });
    
    // In GIS flow, we trigger the popup directly
    client.requestAccessToken();
  };

  const handleDemoClick = () => {
    setIsDemo(true);
    setIsAuthenticated(true);
    setSourceId('demo-source-folder');
    setDestId('demo-dest-folder');
    addLog('System', FileStatus.SKIPPED, 'Demo Mode: Waiting for new files to arrive...');
  };

  const handleSignOut = () => {
    // Clear saved tokens on sign out
    localStorage.removeItem('gapi_access_token');
    localStorage.removeItem('gapi_token_expiry');
    
    if (isDemo) {
      setIsAuthenticated(false);
      setIsDemo(false);
      setIsMonitoring(false);
      setLogs([]);
      setSourceId(ENV_SOURCE_FOLDER);
      setDestId(ENV_DEST_FOLDER);
      return;
    }

    const token = window.gapi.client.getToken();
    if (token !== null) {
      window.google.accounts.oauth2.revoke(token.access_token, () => {
        window.gapi.client.setToken('');
        setIsAuthenticated(false);
        setIsMonitoring(false);
        setLogs([]);
      });
    }
  };

  const addLog = (fileName: string, status: FileStatus, message?: string) => {
    setLogs(prev => {
      // Check if there's an existing entry for this file that's still processing
      const existingIndex = prev.findIndex(
        log => log.fileName === fileName && log.status === FileStatus.PROCESSING
      );
      
      if (existingIndex !== -1) {
        // Update the existing entry instead of creating a new one
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          status,
          message,
          timestamp: new Date()
        };
        return updated;
      }
      
      // Create a new entry only if no processing entry exists for this file
      return [
        {
          id: Math.random().toString(36).substr(2, 9),
          fileName,
          status,
          timestamp: new Date(),
          message
        },
        ...prev
      ];
    });
  };

  // Demo Actions
  const simulateUrlShare = () => {
      if (!demoUrl) return;
      // When sharing from Android to Drive, it creates a text file containing the URL
      injectMockFile(
          `Shared_Link_${Date.now()}.txt`,
          'text/plain',
          demoUrl,
          false
      );
      addLog('System', FileStatus.PENDING, 'Simulated: Phone shared a URL link to Drive');
  };

  const simulateImageUpload = () => {
       const mockContent = "SIMULATED_IMAGE_CONTENT"; 
       injectMockFile(
           `Recipe_Photo_${Date.now()}.jpg`,
           'image/jpeg',
           mockContent,
           true
       );
       addLog('System', FileStatus.PENDING, 'Simulated: New photo uploaded to folder');
  };

  // Logic to process a specific file (shared by Manual Scan and Hook)
  const processSingleFile = async (file: DriveFile) => {
      try {
        if (!SUPPORTED_MIME_TYPES.includes(file.mimeType)) return;
        
        // Check if file is already being processed in this session
        if (processingFileIds.has(file.id)) {
          console.log(`File ${file.name} is already being processed, skipping...`);
          return;
        }
        
        // Mark file as being processed
        setProcessingFileIds(prev => new Set(prev).add(file.id));

        // Check exists (for demo mode compatibility)
        if (isDemo) {
          const exists = await mockCheckFileExists(destId, file.name);
          if (exists) {
            addLog(file.name, FileStatus.SKIPPED, "Already processed, skipping...");
            return;
          }
        } else {
          const exists = await checkFileExists(destId, file.name);
          if (exists) {
            addLog(file.name, FileStatus.SKIPPED, "Already processed, skipping...");
            return;
          }
        }

        addLog(file.name, FileStatus.PROCESSING, "New file detected! Analyzing...");
        
        // Get Content
        const { content, isBinary, mimeType } = isDemo 
          ? await mockGetFileContent(file)
          : await getFileContent(file);

        // Gemini Analysis - use custom prompt from settings
        let processedRecipe: ProcessedRecipe;
        try {
            processedRecipe = await parseRecipeWithGemini(content, mimeType, isBinary, geminiPrompt);
        } catch (geminiError) {
            console.error("Gemini processing failed:", geminiError);
            // Fallback to basic extraction
            const fallbackRecipe = {
              title: `Processed ${file.name}`,
              source: "Error - Check configuration",
              ingredients: ["Check console for details"],
              method: ["Please verify your Gemini API key configuration"],
              prepTime: "N/A", 
              cookTime: "N/A", 
              servings: "N/A"
            };
            processedRecipe = {
              recipe: fallbackRecipe,
              markdown: generateMarkdown(fallbackRecipe),
              imageData: isBinary ? content : undefined,
              imageMimeType: isBinary ? mimeType : undefined
            };
        }

        if (!processedRecipe.recipe.title) throw new Error("No title extracted");

        addLog(file.name, FileStatus.PROCESSING, `Extracted: ${processedRecipe.recipe.title}`);
        
        // Save (markdown + image in folder structure)
        if (isDemo) {
          await mockSaveRecipe(destId, file.name, processedRecipe.recipe);
        } else {
          await saveProcessedRecipe(destId, processedRecipe);
        }
        
        // Move original file to processed/ subfolder
        if (!isDemo) {
          try {
            const processedFolderId = await getProcessedFolderId(destId);
            await moveFile(file.id, processedFolderId);
            addLog(file.name, FileStatus.COMPLETED, `✓ Saved markdown & archived original`);
          } catch (moveError) {
            console.warn("Could not move file to processed folder:", moveError);
            addLog(file.name, FileStatus.COMPLETED, `✓ Saved markdown (original stays in source)`);
          }
        } else {
          addLog(file.name, FileStatus.COMPLETED, `✓ Demo: Would save markdown & image`);
        }

      } catch (err: any) {
          console.error(err);
          addLog(file.name, FileStatus.ERROR, err.message);
      }
  };

  // Callback for our new Hook
  const handleNewFilesDetected = useCallback(async (files: DriveFile[]) => {
      setIsProcessing(true);
      for (const file of files) {
          await processSingleFile(file);
      }
      setIsProcessing(false);
  }, [destId, isDemo, geminiPrompt, sourceId]);

  // Use the Custom Hook
  useDriveMonitor({
      isAuthenticated,
      isMonitoring,
      isDemo,
      sourceId,
      onNewFiles: handleNewFilesDetected,
      onError: (msg) => addLog("Monitor", FileStatus.ERROR, msg)
  });

  // Manual Scan (Legacy support for "Sync Now")
  const manualScan = async () => {
      if (isProcessing) return;
      setIsProcessing(true);
      const listFn = isDemo ? mockListFiles : listFiles;
      const files = await listFn(sourceId);
      for (const file of files) {
          await processSingleFile(file);
      }
      setIsProcessing(false);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full border border-slate-200 text-center">
          <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
            <ChefHat className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Gemini Recipe Sorter</h1>
          <p className="text-slate-600 mb-8">
            Connect your Google Drive to automatically organize your messy recipe screenshots and docs into structured data.
          </p>
          
          <div className="mb-6 text-left">
             <label className="block text-sm font-medium text-slate-700 mb-1">Google Cloud Client ID</label>
             <input 
               type="text" 
               className="w-full p-2 border border-slate-300 rounded text-sm mb-1 font-mono text-slate-600" 
               placeholder="12345...apps.googleusercontent.com"
               value={clientId}
               onChange={(e) => setClientId(e.target.value)}
             />
             <p className="text-xs text-slate-400">Required for Drive API Access</p>
          </div>

          <div className="space-y-3">
            <button
              onClick={handleAuthClick}
              disabled={!gapiLoaded}
              className={`w-full flex items-center justify-center px-4 py-3 border border-transparent text-base font-medium rounded-md text-white md:text-lg transition-colors shadow-sm ${gapiLoaded ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-400 cursor-not-allowed'}`}
            >
              {gapiLoaded ? 'Sign in with Google' : 'Loading Libraries...'}
            </button>
            
            <div className="relative flex py-2 items-center">
                <div className="flex-grow border-t border-slate-200"></div>
                <span className="flex-shrink-0 mx-4 text-slate-400 text-xs uppercase">Or</span>
                <div className="flex-grow border-t border-slate-200"></div>
            </div>

            <button
              onClick={handleDemoClick}
              className="w-full flex items-center justify-center px-4 py-2 border border-slate-300 text-base font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50 transition-colors shadow-sm"
            >
              <TestTube className="w-4 h-4 mr-2" />
              Try Demo Mode
            </button>
          </div>

          {/* Configuration Help Box */}
          <div className="mt-8 bg-amber-50 text-left p-4 rounded-lg border border-amber-200 text-sm">
             <div className="flex items-start">
               <AlertTriangle className="w-5 h-5 text-amber-600 mr-2 flex-shrink-0 mt-0.5" />
               <div>
                 <h4 className="font-semibold text-amber-800 mb-1">Getting "Error 400"?</h4>
                 <p className="text-amber-700 mb-2">
                   This happens if your Client ID is not allowed to run on this URL. 
                   Go to your Google Cloud Console and add this URL to <strong>Authorized JavaScript origins</strong>:
                 </p>
                 <code className="block bg-white p-2 rounded border border-amber-300 text-amber-900 font-mono text-xs select-all break-all">
                   {currentOrigin}
                 </code>
                 <p className="text-amber-700 mt-2 mb-2">
                   Also ensure you're using a <strong>Web Application</strong> Client ID (starts with numbers), not a Desktop/Native client ID.
                 </p>
                 <div className="bg-white p-2 rounded border border-amber-300 text-amber-900 text-xs">
                   <strong>Quick Fix:</strong> Use Demo Mode to test the app without Google authentication.
                 </div>
               </div>
             </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className={`${isDemo ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'} border-b sticky top-0 z-10 transition-colors`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <ChefHat className={`w-8 h-8 ${isDemo ? 'text-amber-600' : 'text-blue-600'} mr-3`} />
              <span className={`text-xl font-bold bg-clip-text text-transparent ${isDemo ? 'bg-gradient-to-r from-amber-600 to-orange-600' : 'bg-gradient-to-r from-blue-600 to-indigo-600'}`}>
                Gemini Recipe Sorter {isDemo && <span className="text-xs font-mono ml-2 text-amber-600 border border-amber-200 bg-amber-100 px-2 py-0.5 rounded">DEMO MODE</span>}
              </span>
            </div>
            <div className="flex items-center space-x-4">
              {isDemo ? (
                 <div className="flex items-center space-x-2 px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-medium border border-amber-200">
                    <span>Using Simulated Drive</span>
                 </div>
              ) : (
                <div className="flex items-center space-x-2 px-3 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium border border-green-200">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                    <span>Connected to Drive</span>
                </div>
              )}
              
              <button 
                onClick={handleSignOut}
                className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
                title={isDemo ? "Exit Demo" : "Sign Out"}
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <section className="mb-8">
            <div className="flex flex-col md:flex-row gap-6 mb-6">
                <FolderSelector 
                    label="Source Folder (Raw Files)" 
                    folderId={sourceId} 
                    onChange={setSourceId} 
                    type="source"
                    disabled={isMonitoring || isDemo}
                />
                <FolderSelector 
                    label="Destination Folder (Markdown Recipes)" 
                    folderId={destId} 
                    onChange={setDestId} 
                    type="destination"
                    disabled={isMonitoring || isDemo}
                />
            </div>

            <div className="flex items-center justify-between bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${isMonitoring ? 'bg-green-500' : 'bg-slate-300'}`}></div>
                    <span className="font-medium text-slate-700">
                        Status: {isMonitoring ? 'Monitoring Active' : 'Idle'}
                    </span>
                    {isProcessing && <span className="text-xs text-blue-600 ml-2 animate-pulse">(Processing...)</span>}
                </div>
                
                <div className="flex space-x-3">
                    {!isMonitoring ? (
                         <button
                         onClick={() => {
                             if (!sourceId || !destId) {
                                 alert("Please set both Source and Destination folder IDs.");
                                 return;
                             }
                             setIsMonitoring(true);
                         }}
                         className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium shadow-sm"
                     >
                         <Play className="w-4 h-4 mr-2" /> Start Monitoring
                     </button>
                    ) : (
                        <button
                        onClick={() => setIsMonitoring(false)}
                        className="flex items-center px-4 py-2 bg-slate-100 text-slate-700 border border-slate-300 rounded-md hover:bg-slate-200 transition-colors font-medium"
                    >
                        <Pause className="w-4 h-4 mr-2" /> Stop Monitoring
                    </button>
                    )}
                   
                   <button 
                     onClick={manualScan}
                     disabled={isProcessing || !sourceId || !destId}
                     className="flex items-center px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors disabled:opacity-50"
                     title="Run full scan"
                   >
                       <ScanSearch className={`w-4 h-4 mr-2 ${isProcessing ? 'animate-spin' : ''}`} /> Scan All
                   </button>
                </div>
            </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
                {/* Simulation Controls (Only in Demo Mode) */}
                {isDemo && isMonitoring && (
                    <div className="bg-amber-50 rounded-lg border border-amber-200 p-6">
                        <h3 className="flex items-center font-semibold text-amber-900 mb-4">
                            <TestTube className="w-5 h-5 mr-2" />
                            Simulation Controls
                        </h3>
                        <p className="text-sm text-amber-800 mb-4">
                            Manually trigger events to test how the app handles different file types appearing in Drive.
                        </p>
                        
                        <div className="space-y-4">
                            <div className="flex gap-2 items-end">
                                <div className="flex-grow">
                                    <label className="block text-xs font-medium text-amber-900 mb-1">
                                        Test Recipe URL (Simulate Phone Share)
                                    </label>
                                    <div className="flex relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <Link className="h-4 w-4 text-amber-500" />
                                        </div>
                                        <input 
                                            type="text" 
                                            value={demoUrl}
                                            onChange={(e) => setDemoUrl(e.target.value)}
                                            className="block w-full pl-10 sm:text-sm border-amber-300 rounded-md focus:ring-amber-500 focus:border-amber-500 p-2"
                                            placeholder="https://..."
                                        />
                                    </div>
                                </div>
                                <button 
                                    onClick={simulateUrlShare}
                                    className="px-4 py-2 bg-amber-200 text-amber-900 rounded-md hover:bg-amber-300 transition-colors text-sm font-medium flex items-center"
                                >
                                    <Smartphone className="w-4 h-4 mr-2" />
                                    Simulate Share
                                </button>
                            </div>

                            <div className="border-t border-amber-200 pt-4 flex gap-3">
                                <button 
                                    onClick={simulateImageUpload}
                                    className="flex items-center px-4 py-2 bg-white border border-amber-300 text-amber-900 rounded-md hover:bg-amber-50 transition-colors text-sm font-medium"
                                >
                                    <FilePlus className="w-4 h-4 mr-2" />
                                    Drop Sample Image
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <ActivityLog logs={logs} />
            </div>

            <div className="space-y-6">
                {/* Settings Panel */}
                <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                    <button 
                      onClick={() => setShowSettings(!showSettings)}
                      className="flex items-center justify-between w-full font-semibold text-slate-800"
                    >
                      <span className="flex items-center">
                        <Settings className="w-5 h-5 mr-2" />
                        AI Prompt Settings
                      </span>
                      <span className="text-slate-400">{showSettings ? '▲' : '▼'}</span>
                    </button>
                    
                    {showSettings && (
                      <div className="mt-4 space-y-3">
                        <p className="text-xs text-slate-500">
                          Customize how Gemini extracts recipe data. Edit the prompt below to change the output format.
                        </p>
                        <textarea
                          value={geminiPrompt}
                          onChange={(e) => {
                            const newPrompt = e.target.value;
                            setGeminiPrompt(newPrompt);
                            // Auto-save to localStorage on change
                            localStorage.setItem('geminiPrompt', newPrompt);
                          }}
                          className="w-full h-48 p-3 text-xs font-mono border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="Enter your Gemini prompt..."
                        />
                        <p className="text-xs text-green-600">✓ Changes are auto-saved and will be used for the next file processed</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              const defaultPrompt = RECIPE_JSON_SCHEMA_PROMPT.trim();
                              setGeminiPrompt(defaultPrompt);
                              localStorage.setItem('geminiPrompt', defaultPrompt);
                            }}
                            className="flex-1 px-3 py-2 text-xs bg-slate-100 text-slate-700 rounded hover:bg-slate-200 transition-colors"
                          >
                            Reset to Default
                          </button>
                        </div>
                      </div>
                    )}
                </div>

                <div className="bg-blue-50 p-6 rounded-lg border border-blue-100">
                    <h3 className="font-semibold text-blue-900 mb-2">Smart Monitoring</h3>
                    <ul className="text-sm text-blue-800 space-y-2 list-disc list-inside">
                        <li>The app uses the <strong>Drive Changes API</strong>.</li>
                        <li>It watches for <strong>new events</strong> rather than rescanning all files.</li>
                        <li>In Demo Mode, use the controls to simulate new files arriving.</li>
                    </ul>
                </div>

                <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                    <h3 className="font-semibold text-slate-800 mb-4">Stats</h3>
                    <div className="grid grid-cols-2 gap-4">
                         <div className="p-3 bg-slate-50 rounded border border-slate-100 text-center">
                            <div className="text-2xl font-bold text-slate-700">
                                {logs.filter(l => l.status === FileStatus.COMPLETED).length}
                            </div>
                            <div className="text-xs text-slate-500 uppercase tracking-wide">Processed</div>
                         </div>
                         <div className="p-3 bg-slate-50 rounded border border-slate-100 text-center">
                            <div className="text-2xl font-bold text-slate-700">
                                {logs.filter(l => l.status === FileStatus.ERROR).length}
                            </div>
                            <div className="text-xs text-slate-500 uppercase tracking-wide">Errors</div>
                         </div>
                    </div>
                </div>
            </div>
        </div>
      </main>
    </div>
  );
}
